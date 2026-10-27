import { cairoParts, fromCairoWall, DEFAULT_PACING } from '@ayman/contracts/marketing/pacing';
import type { OutreachSettings } from '@ayman/contracts/admin/settings';
import type { AccessScope, Prisma } from '../../generated/prisma/client';

/**
 * Every decision `AutoOutreachSweeper` makes that does not need a database,
 * as pure functions over an injected clock — so the rules that decide whether
 * a WhatsApp message goes out from the instructor's own number can be run
 * through a year of edge cases in a unit test instead of being trusted.
 *
 * The sweeper's only job is to fetch the facts these functions are asked
 * about, and to write.
 */

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/**
 * How far back an opened checkout stays worth a reminder.
 *
 * Two days, and that is also the cold-start rule: the morning a device is
 * linked (or relinked after a week offline), the sweeper writes about
 * checkouts from the last two days and nothing older. «لسه الدفع مفتوح» about
 * a page somebody opened a fortnight ago is not a reminder, it is an
 * admission that nobody was looking.
 */
export const CHECKOUT_WINDOW_MS = 2 * DAY_MS;

/**
 * How far back a sign-up stays worth the FIRST nudge — the same job for the
 * signup kind. The backlog older than this is not forgotten: it is the «من غير
 * اشتراك في أي كورس» campaign audience, which the instructor sends once, on
 * purpose, through the paced campaign engine.
 */
export const SIGNUP_WINDOW_MS = 7 * DAY_MS;

/**
 * The second nudge is due `signupNudgeSecondAfterDays` after the first, and
 * stops being due this long after that — the same "only what is still
 * current" rule, for a device that was offline on the day it fell due.
 */
export const SECOND_NUDGE_GRACE_MS = 3 * DAY_MS;

/** «never send both within the same day» — the two kinds' shared cooldown. */
export const CROSS_KIND_COOLDOWN_MS = DAY_MS;

/** Conversion windows for the admin numbers. */
export const CHECKOUT_CONVERSION_MS = 72 * HOUR_MS;
export const SIGNUP_CONVERSION_MS = 7 * DAY_MS;

/**
 * The scopes that mean "this student has bought (or been given) a course".
 *
 * `platform` is NOT here, and that is the whole reason this list exists:
 * `EntitlementService.enroll` creates a platform-wide grant on EVERY first
 * enrollment, free course or not (see `AudienceService.userIdsWithValidAccess`
 * on the same trap), so counting it would make every student who ever opened
 * a free lecture look subscribed. `unassigned` is not access to anything.
 *
 * `section` and `lesson` ARE here: those are unlock codes, usually bought at a
 * centre, and someone who paid for a code is not somebody to welcome with
 * «فاضل أهم خطوة: الكورس».
 */
export const PAID_ACCESS_SCOPES: readonly AccessScope[] = [
  'course',
  'term',
  'course_month',
  'subject_teacher',
  'section',
  'lesson',
];

/**
 * «من غير اشتراك في أي كورس» as a `where` on users — shared by the signup
 * nudge and by the campaign audience box, so the automatic message and the
 * deliberate campaign can never disagree about who it means.
 *
 * Live grant = not revoked, started, not expired: the same three conditions
 * `grant-liveness.ts` applies. A transfer waiting for review counts as
 * subscribing — nudging someone whose money is sitting in the queue is the
 * one message guaranteed to start an argument.
 */
export function neverSubscribedWhere(now: Date): Prisma.UserWhereInput {
  return {
    accessGrants: {
      none: {
        scope: { in: [...PAID_ACCESS_SCOPES] },
        revokedAt: null,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
    },
    paymentSubmissions: { none: { status: 'pending' } },
  };
}

// ── when a WhatsApp message may go out at all ──────────────────────────────

/** The campaign engine's own window, 10:00–22:00 Cairo. Never wider. */
export function inSendingWindow(now: Date): boolean {
  const hour = cairoParts(now).hour;
  return hour >= DEFAULT_PACING.windowStartHour && hour < DEFAULT_PACING.windowEndHour;
}

/** Midnight in Cairo at the start of `now`'s Cairo day — the daily cap's floor. */
export function cairoDayStart(now: Date): Date {
  const p = cairoParts(now);
  return fromCairoWall(p.year, p.month, p.date, 0);
}

/** Shortest gap between two automatic WhatsApp sends. */
const MIN_GAP_MS = 90_000;
/** Spread above the minimum. 90s–4m, so the traffic has no fixed beat. */
const GAP_SPREAD_MS = 150_000;

/**
 * The gap that must follow the message with this id.
 *
 * Derived from the id rather than drawn from `Math.random()` and kept in
 * memory: a restart (or a second replica) then agrees on the same gap, and a
 * deploy can never reset it to zero and let two messages go out back to back.
 * A fixed interval is a fingerprint (see `pacing.ts`); a hash of a uuid is not.
 */
export function gapAfter(previousId: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < previousId.length; index += 1) {
    value ^= previousId.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return MIN_GAP_MS + ((value >>> 0) % GAP_SPREAD_MS);
}

export type SendGate =
  | { open: true }
  | { open: false; reason: 'outside-window' | 'daily-cap' | 'spacing' };

/**
 * Whether ONE more automatic WhatsApp message may go out right now.
 *
 * The device check is not here because it is not a pure fact — it is a call
 * to the sidecar, and the sweeper makes it first, before reading anything.
 */
export function sendGate(input: {
  now: Date;
  sentToday: number;
  dailyCap: number;
  last: { id: string; at: Date } | null;
}): SendGate {
  if (!inSendingWindow(input.now)) return { open: false, reason: 'outside-window' };
  if (input.sentToday >= input.dailyCap) return { open: false, reason: 'daily-cap' };
  if (input.last && input.now.getTime() - input.last.at.getTime() < gapAfter(input.last.id)) {
    return { open: false, reason: 'spacing' };
  }
  return { open: true };
}

// ── checkout recovery ──────────────────────────────────────────────────────

export interface IntentTiming {
  openedAt: Date;
  remindedAt: Date | null;
}

/**
 * Is this opened checkout due a reminder, on timing alone?
 *
 *   · old enough — the configured delay has passed since it was last opened;
 *   · young enough — inside `CHECKOUT_WINDOW_MS` (the cold-start rule);
 *   · not already reminded about THIS opening — and, if it was reopened after
 *     an earlier reminder, not within `checkoutRecoveryEveryDays` of that one.
 *
 * Whether it was then PAID is `checkoutAbandoned`, which needs the database.
 */
export function checkoutDue(
  intent: IntentTiming,
  now: Date,
  settings: Pick<OutreachSettings, 'checkoutRecoveryAfterHours' | 'checkoutRecoveryEveryDays'>,
): boolean {
  const age = now.getTime() - intent.openedAt.getTime();
  if (age < settings.checkoutRecoveryAfterHours * HOUR_MS) return false;
  if (age > CHECKOUT_WINDOW_MS) return false;
  if (intent.remindedAt === null) return true;
  // Reminded about this very opening (or a later one): nothing new to say.
  if (intent.remindedAt >= intent.openedAt) return false;
  return now.getTime() - intent.remindedAt.getTime() >= settings.checkoutRecoveryEveryDays * DAY_MS;
}

/** The scan bounds that match `checkoutDue`, for the query that feeds it. */
export function checkoutScanBounds(
  now: Date,
  settings: Pick<OutreachSettings, 'checkoutRecoveryAfterHours'>,
): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - CHECKOUT_WINDOW_MS),
    to: new Date(now.getTime() - settings.checkoutRecoveryAfterHours * HOUR_MS),
  };
}

/** What the database said about one course checkout since it was opened. */
export interface CourseCheckoutState {
  /** A claim for this course sitting in the review queue, from ANY time. */
  pendingSubmission: boolean;
  /** An approved claim for this course created at or after `openedAt`. */
  approvedSinceOpened: boolean;
  /** A grant on this course created at or after `openedAt` (admin, code…). */
  grantSinceOpened: boolean;
  /** The course is still published and still sold. */
  stillOnSale: boolean;
}

/**
 * Was this course checkout actually abandoned?
 *
 * A PENDING claim from before the opening still counts as "not abandoned":
 * the subscribe panel opens on its «مستني المراجعة» step for exactly that
 * student, so they opened the checkout, saw their transfer was being looked
 * at, and left — which is the opposite of walking away from a payment.
 *
 * A REJECTED claim does not count: their money was not accepted, the checkout
 * is open again, and the reminder is the right message.
 */
export function courseCheckoutAbandoned(state: CourseCheckoutState): boolean {
  return (
    state.stillOnSale &&
    !state.pendingSubmission &&
    !state.approvedSinceOpened &&
    !state.grantSinceOpened
  );
}

/** A book order is abandoned exactly while it is live and still unpaid. */
export function bookCheckoutAbandoned(order: { status: string; deletedAt: Date | null } | null): boolean {
  return order !== null && order.deletedAt === null && order.status === 'address_only';
}

/**
 * The ledger key for one reminder about one OPENING of one checkout.
 *
 * The opening's timestamp is in it, so a checkout reopened weeks later is a
 * new message (if `checkoutDue` allows it) while a retried pass about the same
 * opening hits `outreach_messages_dedupe_key` and writes nothing.
 */
export function checkoutDedupeKey(intent: { id: string; openedAt: Date }): string {
  return `${intent.id}:${intent.openedAt.getTime()}`;
}

/** The intent id back out of a `checkout_recovery` ledger key. */
export function intentIdOfDedupeKey(key: string): string {
  return key.split(':')[0] ?? key;
}

// ── signup nudge ───────────────────────────────────────────────────────────

/** Sign-ups the FIRST nudge may consider: past the delay, inside the window. */
export function signupScanBounds(
  now: Date,
  settings: Pick<OutreachSettings, 'signupNudgeAfterHours'>,
): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - SIGNUP_WINDOW_MS),
    to: new Date(now.getTime() - settings.signupNudgeAfterHours * HOUR_MS),
  };
}

/**
 * First nudges whose SECOND is due: sent at least N days ago, and not so long
 * ago that the second would be about a week nobody remembers. `null` when the
 * second nudge is switched off (`0`).
 */
export function secondNudgeBounds(
  now: Date,
  settings: Pick<OutreachSettings, 'signupNudgeSecondAfterDays'>,
): { from: Date; to: Date } | null {
  if (settings.signupNudgeSecondAfterDays <= 0) return null;
  const to = new Date(now.getTime() - settings.signupNudgeSecondAfterDays * DAY_MS);
  return { from: new Date(to.getTime() - SECOND_NUDGE_GRACE_MS), to };
}

export const SIGNUP_STEP_KEYS = { 1: 'step1', 2: 'step2' } as const;

/**
 * «If a student has an open checkout, the checkout reminder wins; never both
 * in one day.»
 *
 * The signup nudge stands down for a student who has opened ANY checkout in
 * the reminder window (they are already trying to pay, and the checkout kind
 * owns them), or who got a checkout reminder in the last day.
 */
export function signupYieldsToCheckout(input: {
  now: Date;
  latestIntentOpenedAt: Date | null;
  latestCheckoutReminderAt: Date | null;
}): boolean {
  const now = input.now.getTime();
  if (input.latestIntentOpenedAt && now - input.latestIntentOpenedAt.getTime() <= CHECKOUT_WINDOW_MS) {
    return true;
  }
  return (
    input.latestCheckoutReminderAt !== null &&
    now - input.latestCheckoutReminderAt.getTime() < CROSS_KIND_COOLDOWN_MS
  );
}

/** The other half of the same rule: a checkout reminder waits out a signup nudge sent today. */
export function checkoutWaitsForSignup(now: Date, latestSignupNudgeAt: Date | null): boolean {
  return latestSignupNudgeAt !== null && now.getTime() - latestSignupNudgeAt.getTime() < CROSS_KIND_COOLDOWN_MS;
}
