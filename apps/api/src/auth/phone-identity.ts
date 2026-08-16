import { normalizeEgyptianPhone } from '@ayman/contracts/phone';

/**
 * Deciding what to do with the `phoneNumber` in an inbound Better Auth request
 * body — the pure half of `createAuthBeforeHook`.
 *
 * Split out for the reason `login-security.service.ts` gives: the hook itself
 * imports `better-auth/api`, which is ESM-only and cannot be `require()`d by
 * Jest, so no spec can reach it. Everything with a decision in it lives here
 * instead.
 *
 * ## Why this exists at all
 *
 * Better Auth's phone-number plugin looks an account up with an EXACT STRING
 * match (`adapter.findOne({ field: 'phoneNumber', value })`) and its
 * `phoneNumberValidator` option is typed to return a `boolean` — it is a gate,
 * not a transform, so nothing in the library will ever rewrite what it is
 * handed.
 *
 * That combination is quietly dangerous. A student who registers as
 * `+201012345678` and later types `01012345678` is, to Better Auth, a
 * different account: the lookup misses, the unique index agrees the two
 * strings differ, and the login screen tells them they have no account. No
 * error is logged anywhere. The only fix is to normalise on the way IN, which
 * is what this module decides and the hook applies.
 *
 * The client normalises too (`egyptianPhone` in the register form), but that
 * is a convenience — nothing stops a caller POSTing straight past it, so the
 * guarantee has to live server-side.
 */

/** The route a password account is born on — phone included, or it is refused. */
export const PHONE_SIGN_UP_PATH = '/sign-up/email';

/**
 * The sign-in and OTP routes. These NORMALISE but never reject, because a
 * rejection here would be a client-observable branch that "wrong password"
 * does not have — see the `reject`/`ignore` split below.
 */
const PHONE_LOOKUP_PATHS = new Set([
  '/sign-in/phone-number',
  '/phone-number/send-otp',
  '/phone-number/verify',
  '/phone-number/request-password-reset',
  '/phone-number/reset-password',
]);

const REQUIRED_MESSAGE = 'رقم الموبايل مطلوب';
/** Kept byte-identical to `packages/contracts/src/phone.ts`'s own message. */
const INVALID_MESSAGE = 'رقم الهاتف يجب أن يكون رقمًا مصريًا صحيحًا';

export type PhoneNormalizationPlan =
  /** Nothing to do — not a phone-bearing path, or nothing usable to rewrite. */
  | { action: 'ignore' }
  /** Replace `body.phoneNumber` with this E.164 string before the handler runs. */
  | { action: 'rewrite'; phoneNumber: string }
  /** Refuse the request outright with this Arabic message. Sign-up only. */
  | { action: 'reject'; message: string };

function readPhone(body: unknown): { present: boolean; value: string } {
  if (typeof body !== 'object' || body === null) return { present: false, value: '' };
  const raw = (body as { phoneNumber?: unknown }).phoneNumber;
  // Deliberately not coercing a number: `201012345678` arriving as JSON number
  // has already lost its leading `+`, and `String()`-ing it would manufacture a
  // plausible-looking value out of something the client got wrong.
  if (typeof raw !== 'string') return { present: false, value: '' };
  return { present: raw.trim() !== '', value: raw };
}

export function planPhoneNormalization(path: string, body: unknown): PhoneNormalizationPlan {
  const isSignUp = path === PHONE_SIGN_UP_PATH;
  if (!isSignUp && !PHONE_LOOKUP_PATHS.has(path)) return { action: 'ignore' };

  const { present, value } = readPhone(body);

  if (!present) {
    /**
     * Sign-up is the ONE place a missing number is fatal. This is the
     * server-side half of "every account has a phone" — the register form
     * validates as well, but `users.phone_number` is nullable (it must be:
     * Google creates the row before the student ever reaches onboarding), so
     * without this branch `/sign-up/email` is an open door to a permanently
     * phone-less password account.
     */
    return isSignUp ? { action: 'reject', message: REQUIRED_MESSAGE } : { action: 'ignore' };
  }

  const normalized = normalizeEgyptianPhone(value);

  if (normalized === null) {
    /**
     * The asymmetry here is S1, not an oversight.
     *
     * On SIGN-UP the student is filling in a field, and telling them the
     * number is malformed reveals nothing about which accounts exist — so they
     * get a real message instead of a mystery.
     *
     * On SIGN-IN it must stay silent. A distinct "that is not a valid number"
     * response would be a branch an attacker can observe and "wrong password"
     * cannot produce. Left untouched, the value simply fails to match any row
     * and the attempt lands on the same generic 401 as every other bad
     * credential.
     */
    return isSignUp ? { action: 'reject', message: INVALID_MESSAGE } : { action: 'ignore' };
  }

  return { action: 'rewrite', phoneNumber: normalized };
}
