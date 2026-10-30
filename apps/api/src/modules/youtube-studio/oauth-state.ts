import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The OAuth `state` for «ربط قناة اليوتيوب» — the CSRF control of the
 * round-trip through Google.
 *
 * ## Three things it proves, in this order
 *
 *   1. **It was minted here.** `nonce.expiry.mac`, where the MAC is HMAC-SHA256
 *      over the nonce, the expiry and the ADMIN'S USER ID, under a key derived
 *      from `BETTER_AUTH_SECRET`. A forged or edited state fails here without
 *      a database read.
 *   2. **It was minted for THIS session's admin.** The user id is inside the
 *      MAC but not in the string, so a state started by one admin and finished
 *      in another admin's browser — the classic «attacker links their own
 *      channel into the victim's platform» login-CSRF — does not verify.
 *   3. **It is used once.** The service stores the SHA-256 of the nonce on the
 *      connection row and consumes it with a conditional UPDATE; a replayed
 *      callback URL finds nothing to consume.
 *
 * Ten minutes is long enough to pick an account and read Google's consent
 * screen, short enough that a URL left in a history file is dead.
 */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface IssuedState {
  /** Goes to Google, comes back on the callback. */
  state: string;
  /** What the row stores — never the nonce itself. */
  nonceHash: string;
  expiresAt: Date;
}

function mac(key: Buffer, nonce: string, expiry: number, userId: string): string {
  return createHmac('sha256', key).update(`${nonce}.${expiry}.${userId}`).digest('base64url');
}

export function hashNonce(nonce: string): string {
  return createHash('sha256').update(nonce).digest('hex');
}

export function issueState(userId: string, key: Buffer, now: Date = new Date()): IssuedState {
  const nonce = randomBytes(32).toString('base64url');
  const expiry = now.getTime() + OAUTH_STATE_TTL_MS;
  return {
    state: `${nonce}.${expiry}.${mac(key, nonce, expiry, userId)}`,
    nonceHash: hashNonce(nonce),
    expiresAt: new Date(expiry),
  };
}

/**
 * The nonce's hash when the state is authentic, unexpired and bound to
 * `userId`; `null` otherwise. Says nothing about whether it was already USED —
 * that is the row's job.
 */
export function verifyState(
  state: string | undefined,
  userId: string,
  key: Buffer,
  now: Date = new Date(),
): string | null {
  if (!state || state.length > 256) return null;
  const parts = state.split('.');
  if (parts.length !== 3) return null;
  const [nonce, expiryText, given] = parts as [string, string, string];
  if (!/^[A-Za-z0-9_-]{43}$/.test(nonce) || !/^\d{1,15}$/.test(expiryText)) return null;
  const expiry = Number(expiryText);
  if (expiry <= now.getTime()) return null;

  const expected = Buffer.from(mac(key, nonce, expiry, userId));
  const actual = Buffer.from(given);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return hashNonce(nonce);
}
