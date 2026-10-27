import { randomInt } from 'node:crypto';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_DEV,
  decodeReferralCookie,
  type ReferralFriendStatus,
} from '@ayman/contracts/referrals';
import type { ReferralStatus } from '../../generated/prisma/client';

/**
 * «دعوة الصحاب» — every decision the program makes that needs no database,
 * kept pure so the rules that decide money can be tested one by one.
 */

/** Six characters off the unambiguous alphabet — ~887M codes, CSPRNG-drawn. */
export function generateReferralCode(draw: (max: number) => number = randomInt): string {
  let code = '';
  for (let index = 0; index < REFERRAL_CODE_LENGTH; index += 1) {
    code += REFERRAL_CODE_ALPHABET[draw(REFERRAL_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * The click a sign-up request carries, from its raw `Cookie` header. The
 * `__Host-` cookie wins over the development name when both are present — a
 * production browser never has the second, and a stale development one must
 * not outvote it.
 */
export function referralClickFromCookieHeader(
  header: string | null | undefined,
): { code: string; clickedAt: Date } | null {
  if (!header) return null;
  const jar = new Map<string, string>();
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    if (!jar.has(name)) jar.set(name, part.slice(separator + 1).trim());
  }
  const raw = jar.get(REFERRAL_COOKIE) ?? jar.get(REFERRAL_COOKIE_DEV);
  if (!raw) return null;
  try {
    return decodeReferralCookie(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

/**
 * Whether a click still attributes a sign-up made `now`. Measured against the
 * admin's CURRENT window, so shortening it applies to cookies already issued.
 * A click "from the future" (a skewed client clock cannot set this — the
 * server stamped it — but a hand-written cookie can) never counts.
 */
export function clickWithinWindow(clickedAt: Date, now: Date, windowDays: number): boolean {
  const age = now.getTime() - clickedAt.getTime();
  return age >= -60_000 && age <= windowDays * 24 * 60 * 60 * 1000;
}

/** The phones one person can be recognised by, each normalised to E.164. */
export interface PersonPhones {
  userId: string;
  bannedAt: Date | null;
  /** The account's own number and the profile's mirror of it. */
  own: readonly (string | null | undefined)[];
  /** «رقم الأب» / «رقم الأم» from the profile. */
  guardian: readonly (string | null | undefined)[];
}

export type ReferralBlockReason = 'self' | 'same_phone' | 'guardian_phone' | 'banned';

function normalised(values: readonly (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const phone = normalizeEgyptianPhone(value);
    if (phone) out.add(phone);
  }
  return out;
}

function overlaps(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

/**
 * The abuse rules that need nothing but the two people — `null` when the
 * reward may go ahead. The monthly cap needs a count and lives in the service.
 *
 * ## Why phones, and why the guardian's
 *
 * A second account is the whole attack: the same student signs up again
 * through their own link and pays a cheap month to collect both rewards. The
 * account is new, the name is anything — but Egyptian sign-up is by phone, and
 * the profile asks for a parent's number. The same number on both sides, or
 * the same parent behind both students, is the cheapest signal there is.
 *
 * ⚠️ Siblings share a parent and are refused too. That is deliberate: two
 * siblings are one household paying once, and the program is for bringing in
 * a NEW one. An admin who disagrees on a case has the wallet desk.
 */
export function referralAbuse(referrer: PersonPhones, referred: PersonPhones): ReferralBlockReason | null {
  if (referrer.userId === referred.userId) return 'self';
  if (referrer.bannedAt || referred.bannedAt) return 'banned';

  const referrerOwn = normalised(referrer.own);
  const referredOwn = normalised(referred.own);
  if (overlaps(referrerOwn, referredOwn)) return 'same_phone';

  const referrerGuardian = normalised(referrer.guardian);
  const referredGuardian = normalised(referred.guardian);
  // A parent's number on one side that is the other student's own number is
  // the same household as two students sharing a parent.
  if (
    overlaps(referrerGuardian, referredGuardian) ||
    overlaps(referrerGuardian, referredOwn) ||
    overlaps(referredGuardian, referrerOwn)
  ) {
    return 'guardian_phone';
  }
  return null;
}

/**
 * Whether a wallet purchase was paid for with REAL money.
 *
 * The wallet is fungible, so «which pound paid for this course» has no answer
 * — this asks the conservative question instead: by the moment of the
 * purchase, had at least as much real money (`counts_as_income` rows: an
 * approved transfer, a paid code, an admin's «دفعلي كاش») entered this wallet
 * as had ever been spent on courses from it, this purchase included? If yes,
 * no gift, compensation or referral reward was needed to pay for it.
 *
 * Referral rewards are never income (CHECK), so a student who funds a course
 * with the reward from a friend can never use that course to trigger a reward
 * of their own — the chain A→B→C cannot pay twice on one real payment.
 */
export function realMoneyCovers(incomeCents: number, spentCents: number): boolean {
  return incomeCents >= spentCents;
}

/**
 * What a reversal may take back from one wallet: the reward, or whatever is
 * left if the student already spent part of it. Never below zero — the
 * ledger's CHECK would refuse it anyway, and a negative balance would block
 * every future purchase over a few pounds of somebody else's refund.
 */
export function reversalTake(balanceCents: number, rewardCents: number): number {
  return Math.max(0, Math.min(balanceCents, rewardCents));
}

/**
 * The first instant of the Cairo calendar month `now` is in — the monthly
 * cap's boundary. Intl, not a fixed offset: Egypt observes DST again, so the
 * offset is two hours in winter and three in summer.
 */
export function cairoMonthStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const offset = Math.round((wall - Math.floor(now.getTime() / 1000) * 1000) / 60_000) * 60_000;
  // The offset is today's; a DST switch inside the month moves the boundary by
  // an hour at most, which a monthly cap does not notice.
  return new Date(Date.UTC(get('year'), get('month') - 1, 1) - offset);
}

/** The student's coarse view of a referral — see `ReferralFriendStatusSchema`. */
export function friendStatusOf(status: ReferralStatus): ReferralFriendStatus {
  switch (status) {
    case 'joined':
      return 'joined';
    case 'credited':
      return 'credited';
    case 'reversed':
      return 'reversed';
    case 'blocked':
    case 'voided':
      return 'closed';
  }
}
