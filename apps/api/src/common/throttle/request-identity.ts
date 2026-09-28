import { createHash } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';

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
 * It is trustworthy BECAUSE the request came through Cloudflare. Since
 * 2026-09-28 the host firewall (Hostinger's, in front of the VM) admits 80/443
 * from Cloudflare's ranges only, so there is no other way in. Before that the
 * origin answered on its own IP, where anyone could set this header — so don't
 * carry this reasoning to a host that is reachable directly.
 *
 * The value is a rate-limit KEY, not an address to display: IPv6 comes back
 * as its /64 (see `ipBucket`), because every caller of this function uses it to
 * count attempts.
 */
export function clientIpFromRequest(request: ThrottleRequest): string {
  const raw = request.headers?.['cf-connecting-ip'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = header?.trim();
  if (trimmed) return ipBucket(trimmed);
  return request.ip ? ipBucket(request.ip) : 'unknown';
}

/**
 * One bucket per subscriber, not per address.
 *
 * An ISP hands an IPv6 customer at least a /64 — 2^64 addresses, every one of
 * them theirs. Keyed on the full address, one household can mint a fresh bucket
 * per request and walk straight through the `ip` ceiling, the guardian lock and
 * the unlock-code lock. Masking to /64 gives that household one key, which is
 * what Better Auth's own limiter does (`normalizeIP`, `ipv6Subnet: 64`).
 *
 * IPv4 is left alone; an IPv4-mapped IPv6 (`::ffff:1.2.3.4`, what Node reports
 * for a v4 client on a dual-stack socket) is unwrapped to the IPv4 it carries,
 * so the same client does not get two buckets depending on the socket.
 */
export function ipBucket(ip: string): string {
  const lower = ip.trim().toLowerCase();
  if (isIPv4(lower)) return lower;
  if (!isIPv6(lower)) return lower;

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (mapped?.[1] && isIPv4(mapped[1])) return mapped[1];

  const [head = '', tail] = lower.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups =
    tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  return `${groups
    .slice(0, 4)
    .map((g) => g.padStart(4, '0'))
    .join(':')}::/64`;
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

  // The native apps carry their session as `Authorization: Bearer <token>`
  // and send no cookie at all (see the `bearer()` plugin note in
  // `auth.config.ts`), so without this branch EVERY signed-in mobile student
  // falls through to the IP bucket below.
  //
  // That is not a mild degradation. Egyptian mobile data is heavily
  // carrier-NATed — Vodafone, Orange and Etisalat each present thousands of
  // subscribers behind a handful of addresses — so the fallback would put an
  // entire carrier's students into ONE 10-requests-per-second bucket and they
  // would throttle each other out of their own lessons. The web has never hit
  // this because a browser always has the cookie.
  //
  // Hashed for the same reason and with the same caveat as the cookie above:
  // stable equality is all the throttler needs, the raw value is a hijacking
  // primitive in a log line, and this key is FORGEABLE — `ipTrackerFromRequest`
  // remains the ceiling that no client-supplied value can raise.
  const rawAuth = request.headers?.['authorization'];
  const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  // Case-insensitive: RFC 9110 §11.1 makes the scheme token case-insensitive
  // and Dio capitalises it, so a `startsWith('Bearer ')` would work today and
  // break silently the first time a client sends `bearer`.
  if (authHeader && /^bearer\s+\S/i.test(authHeader)) {
    const token = authHeader.replace(/^bearer\s+/i, '').trim();
    return `sess:${createHash('sha256').update(token).digest('base64url').slice(0, 22)}`;
  }

  // Anonymous traffic (login, catalog) still needs a bucket, and the IP is
  // the only identity available. The CLIENT's IP — `request.ip` is the
  // Cloudflare edge, so keying on it put every guest routed through one PoP
  // into one bucket: a public route limited to 1 per 10 s was 1 per 10 s for
  // all of them. `unknown` is explicit rather than letting an undefined tracker
  // silently merge every such request into one key.
  return `ip:${clientIpFromRequest(request)}`;
}

/**
 * Every named throttler configured in `app.module.ts`, and the ONLY place the
 * list is written down.
 *
 * ⚠️ This exists because `@SkipThrottle()` is per-name and fails SILENTLY when
 * the name is wrong. `ThrottlerGuard` reads `THROTTLER:SKIP<name>` for each
 * configured throttler (`throttler.guard.js:68`), while a bare
 * `@SkipThrottle()` writes only `THROTTLER:SKIPdefault`. This app has no
 * throttler called `default`, so the bare decorator skips NOTHING — it
 * compiles, type-checks, reads as protection, and does nothing at all.
 *
 * So the names are declared once here, `app.module.ts` builds its throttlers
 * from them, and `SKIP_ALL_THROTTLERS` below builds the decorator's argument
 * from the same list. Adding a fifth throttler cannot then quietly
 * un-exempt a route that is meant to be exempt.
 */
export const THROTTLER_NAMES = ['short', 'medium', 'long', 'ip'] as const;

/**
 * The argument for `@SkipThrottle()` that actually exempts a route.
 *
 * `@SkipThrottle(SKIP_ALL_THROTTLERS)`, never `@SkipThrottle()`.
 */
export const SKIP_ALL_THROTTLERS: Record<string, boolean> = Object.fromEntries(
  THROTTLER_NAMES.map((name) => [name, true]),
);
