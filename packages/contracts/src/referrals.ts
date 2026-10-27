import { z } from '@ayman/contracts/zod';

/**
 * «ادعي صاحبك» — the student's half, and the two constants the web's
 * `/r/<code>` route and the API's sign-up hook must agree on.
 *
 * The admin's half lives in `./admin/referrals` and must never be imported
 * from a student module. No relative imports — same rule as every other leaf
 * module in this package.
 */

/**
 * The alphabet a share code is drawn from: no `0/O`, no `1/I/L`. The code is
 * read off a screen and typed into a phone as often as it is tapped, and a
 * misread character is a friend attributed to nobody. Same reasoning as the
 * guardian code.
 */
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE_LENGTH = 6;
export const REFERRAL_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

/** A code as it arrives in a URL — any case, trimmed — or `null` if it is not one. */
export function normalizeReferralCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

/**
 * The first-party cookie `/r/<code>` sets and the sign-up hook reads.
 *
 * `__Host-` in production for the reason every other cookie here carries it:
 * no subdomain can plant or overwrite it. The prefix requires `Secure`, which
 * plain-http development cannot satisfy in every browser, so development uses
 * the bare name — the same split `auth.config.ts` makes for the session
 * cookie. The API accepts either, preferring the prefixed one.
 */
export const REFERRAL_COOKIE = '__Host-ref';
export const REFERRAL_COOKIE_DEV = 'ref';

/**
 * How long the cookie lives in the browser — the CEILING of the admin's
 * window, not the window itself. The cookie carries the moment of the click,
 * and the API measures the admin's current `windowDays` from that moment, so
 * shortening the window takes effect on cookies already out there.
 */
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

/** `CODE.<unix seconds>` — the last click wins, so every click rewrites it. */
export function encodeReferralCookie(code: string, clickedAt: Date): string {
  return `${code}.${Math.floor(clickedAt.getTime() / 1000)}`;
}

export function decodeReferralCookie(value: string): { code: string; clickedAt: Date } | null {
  const [rawCode, rawSeconds, ...rest] = value.split('.');
  if (rest.length > 0 || !rawCode || !rawSeconds || !/^\d{1,12}$/.test(rawSeconds)) return null;
  const code = normalizeReferralCode(rawCode);
  if (!code) return null;
  return { code, clickedAt: new Date(Number(rawSeconds) * 1000) };
}

/**
 * What a student sees of one friend. Deliberately coarser than the admin's
 * five statuses: `blocked` and `voided` are both «مش محسوبة» to the student —
 * telling them WHICH abuse rule fired would be a recipe for getting round it.
 */
export const ReferralFriendStatusSchema = z.enum(['joined', 'credited', 'reversed', 'closed']);
export type ReferralFriendStatus = z.infer<typeof ReferralFriendStatusSchema>;

export const ReferralFriendSchema = z.object({
  /** First name only — enough to recognise a friend, nothing more. */
  firstName: z.string(),
  status: ReferralFriendStatusSchema,
  joinedAt: z.iso.datetime(),
});
export type ReferralFriend = z.infer<typeof ReferralFriendSchema>;

/** `GET /api/me/referrals` — the whole «ادعي صاحبك» page in one read. */
export const MyReferralsSchema = z.object({
  /** The program is switched on. When `false` the page explains, and the link still exists. */
  active: z.boolean(),
  code: z.string(),
  /** Piastres each side gets per paying friend, as the program stands NOW. */
  referrerRewardCents: z.number().int().min(0),
  friendRewardCents: z.number().int().min(0),
  windowDays: z.number().int().min(1),
  counts: z.object({
    /** Signed up through the link. */
    joined: z.number().int().min(0),
    /** Of those, made a first real payment. */
    paid: z.number().int().min(0),
    /** Of those, rewarded (and not taken back). */
    credited: z.number().int().min(0),
  }),
  /** Rewards credited to this student and still standing, in piastres. */
  earnedCents: z.number().int().min(0),
  /** Newest first, at most 50. */
  friends: z.array(ReferralFriendSchema),
});
export type MyReferrals = z.infer<typeof MyReferralsSchema>;
