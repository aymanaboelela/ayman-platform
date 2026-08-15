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
 * The CLIENT's address, as opposed to whatever hop last touched the request.
 *
 * `request.ip` is Express's answer, and Express derives it from `trust proxy`,
 * which `main.ts` sets to `1`. Production has TWO hops in front of the app
 * (Cloudflare, then the reverse proxy), so `request.ip` is a Cloudflare edge
 * address — the same value for every student routed through that PoP.
 *
 * `cf-connecting-ip` is the real client, and Cloudflare sets it itself: a
 * client that sends its own is answered with 403 at the edge (measured
 * 2026-08-15). So for every request that actually came through Cloudflare —
 * which is all real traffic — this is trustworthy.
 *
 * ⚠️ It is trustworthy BECAUSE the request came through Cloudflare, and the
 * origin currently also answers on its own IP, where nothing sets or strips
 * this header. Somebody hitting the origin directly can therefore put anything
 * here. That is not a regression — reaching the origin directly already
 * bypasses every edge control, and the limiter it would be evading is one that
 * could previously be evaded from anywhere with a single cookie. Closing the
 * origin to Cloudflare's ranges is what makes this airtight, and it is the
 * outstanding infrastructure task.
 */
export function clientIpFromRequest(request: ThrottleRequest): string {
  const raw = request.headers?.['cf-connecting-ip'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = header?.trim();
  if (trimmed) return trimmed;
  return request.ip ?? 'unknown';
}

/**
 * A bucket nobody can opt out of.
 *
 * ⚠️ THE POINT of this existing alongside `trackerFromRequest` below: that one
 * keys on the session cookie, and the cookie is NEVER VALIDATED before it is
 * hashed. Any client can send `Cookie: session_token=<random>` and change it
 * every request, and each distinct value mints a fresh bucket — which makes
 * the 10/s, 60/min and 1000/hr limits below decorative. One header, no
 * account, and the rate limiter is gone.
 *
 * That cannot be fixed inside the session key itself: validating the token
 * would need a database read on every request BEFORE any limit applies, which
 * is the amplifier a limiter exists to prevent. Composing IP and session into
 * one key does not help either — a fresh cookie still yields a fresh
 * composite.
 *
 * So the session keys keep their job (fairness BETWEEN students, including 40
 * of them behind one school NAT), and this adds the ceiling that no forgeable
 * value can raise. The two are complementary, not alternatives, which is why
 * both are wired in `app.module.ts`.
 */
export function ipTrackerFromRequest(request: ThrottleRequest): string {
  return `ip:${clientIpFromRequest(request)}`;
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
 *
 * ⚠️ This value is FORGEABLE and is not a security boundary on its own. The
 * cookie is hashed without ever being validated, so a client can mint an
 * unlimited number of these. It is here for FAIRNESS — keeping one student's
 * traffic from consuming a classmate's allowance — and the abuse ceiling is
 * `ipTrackerFromRequest` above. Never make this the only tracker.
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
