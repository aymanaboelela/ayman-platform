import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * A shared-secret compare that takes the same time whether the first byte or
 * the last one is wrong.
 *
 * `token !== expected` returns as soon as the strings differ, so over enough
 * requests the response time leaks how much of a guess was right. Hashing both
 * sides first gives `timingSafeEqual` the equal-length inputs it requires
 * without revealing the secret's length either.
 */
export function tokensMatch(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
