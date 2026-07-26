import { createHash } from 'node:crypto';

/**
 * Both spellings of the Better Auth session cookie: the `__Host-` prefixed
 * production name and the unprefixed development one (see `auth.config.ts`
 * for why the prefix is conditional). Longest first so the prefixed name is
 * matched before the plain one.
 */
const SESSION_COOKIE_NAMES = ['__Host-session_token', 'session_token'] as const;

export interface ThrottleRequest {
  ip?: string | undefined;
  // Optional, not required: `ThrottlerGetTrackerFunction` (from
  // `@nestjs/throttler`) types the raw Express request as
  // `Record<string, any>`, which does not guarantee a `headers` KEY exists at
  // all (only that its value would be `any` if present) — a required field
  // here would make this function type-incompatible with that signature.
  headers?: Record<string, string | string[] | undefined>;
}

function readCookie(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    // Trim only the name: a cookie VALUE may legitimately contain '='.
    if (part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return undefined;
}

/**
 * The throttler's identity for a request.
 *
 * IP-only tracking is wrong for this product in both directions: one school's
 * NAT would share a single bucket (40 students in a lab lock each other out of
 * their own lessons), while one student on mobile data changes IP mid-lesson
 * and escapes their own limit. Keying on the session token fixes both.
 *
 * The token is hashed, never stored raw: tracker keys reach the throttler
 * store and, on a miss, the logs — a raw session token in either is a
 * hijacking primitive, and the throttler only needs stable equality.
 */
export function trackerFromRequest(request: ThrottleRequest): string {
  const rawCookie = request.headers?.['cookie'];
  const cookieHeader = Array.isArray(rawCookie) ? rawCookie.join('; ') : rawCookie;

  if (cookieHeader) {
    for (const name of SESSION_COOKIE_NAMES) {
      const value = readCookie(cookieHeader, name);
      if (value) {
        return `sess:${createHash('sha256').update(value).digest('base64url').slice(0, 22)}`;
      }
    }
  }

  // Anonymous traffic (login, catalog) still needs a bucket, and the IP is
  // the only identity available. `unknown` is explicit rather than letting an
  // undefined tracker silently merge every such request into one key.
  return `ip:${request.ip ?? 'unknown'}`;
}
