import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The guest's claim on their own conversation.
 *
 * A visitor who never signed in still has to be able to come back tomorrow and
 * read the answer. There is no account to hang that on, so the thread is bound
 * to an opaque bearer token in a cookie — and everything below exists to make
 * that binding as boring as possible.
 *
 * ## The database never sees the token
 *
 * Only `sha256(token)` is stored. A dump of `conversations` therefore hands
 * out no read access at all: the column cannot be replayed as a cookie. This
 * is the same reasoning behind storing a password verifier rather than a
 * password, and it costs one hash per request.
 *
 * ## 256 bits, from the CSPRNG
 *
 * The token is the ONLY thing standing between a stranger and a guest's
 * thread, so it is not a uuid and not a timestamp — both are guessable in
 * ways that matter here. 32 random bytes, base64url, is not enumerable.
 */

const TOKEN_BYTES = 32;

/** Mirrors `auth.config.ts`: `__Host-` needs `Secure`, which Safari will not
 *  accept on `http://localhost`, so the prefix is production-only. */
export function guestCookieName(isProduction: boolean): string {
  return isProduction ? '__Host-assistant' : 'assistant';
}

/** 90 days. Long enough that a student who asked about prices in August still
 *  has their thread in October; short enough to expire on a shared machine. */
export const GUEST_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

export function mintGuestToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashGuestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Constant-time comparison of two hashes.
 *
 * Lookup is by unique index, so this is not on the hot path for finding a
 * thread — it is here for the places that CONFIRM a token already resolved to
 * a row. `===` on a secret-derived value leaks its prefix through timing, and
 * the fix is cheap enough that there is no reason to reason about whether the
 * leak is exploitable in this particular position.
 */
export function guestTokenMatches(hashA: string, hashB: string): boolean {
  const a = Buffer.from(hashA, 'utf8');
  const b = Buffer.from(hashB, 'utf8');
  // `timingSafeEqual` throws on a length mismatch, which is itself an
  // observable difference — but the lengths here are both a fixed-width hex
  // digest, so unequal length means malformed input, not a near-miss guess.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Reads one cookie out of a raw `Cookie` header.
 *
 * Hand-rolled rather than adding `cookie-parser`: the API bootstraps with
 * `bodyParser: false` and installs middleware deliberately (see
 * `security.module.ts`), and this is fifteen lines against a new dependency in
 * the request path of every route. Mirrors the reader in
 * `common/throttle/request-identity.ts` — trims only the NAME, because a
 * cookie value may legitimately contain `=`.
 */
export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return undefined;
}
