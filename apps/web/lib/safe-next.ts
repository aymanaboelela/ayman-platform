/**
 * The ONLY way any surface may read a `?next=` parameter.
 *
 * `next` carries where a visitor was headed before the login gate stopped them
 * (`proxy.ts` sets it; the login, register and onboarding forms consume it). It
 * arrives from the query string and ends up in a client-side navigation, which
 * makes an unvalidated read a textbook open redirect —
 * `/login?next=https://evil.com` — on the one page a user is most primed to
 * trust, immediately after typing a password.
 *
 * Returns the path only when it is a SAME-ORIGIN ABSOLUTE PATH, and `null`
 * otherwise. Callers fall back to their own default destination on `null`;
 * nothing treats a rejection as an error.
 *
 * Two layers, because each catches something the other misses:
 *
 *  1. A literal `startsWith('/')` check. The WHATWG parser below happily
 *     resolves `courses/x` against the base into a same-origin URL, so parsing
 *     alone would accept relative input that never came from `proxy.ts`.
 *  2. Parsing against a base whose origin cannot be reached any other way, then
 *     comparing origins. This is what defeats the classic bypasses, because the
 *     parser normalises them the same way a browser would:
 *       `//evil.com`  → host `evil.com` → origin differs → rejected
 *       `/\evil.com`  → the parser folds a backslash to `/` for special
 *                       schemes, so this IS `//evil.com` → rejected
 *     Hand-rolled prefix checks have historically missed the second one.
 *
 * Control characters and whitespace are rejected before either: browsers strip
 * tab/newline out of URLs, so a `next` containing them can become `//evil.com`
 * AFTER a check that looked at the raw string. Nothing legitimate contains them
 * — a real path arrives percent-encoded.
 */

/**
 * `.invalid` is reserved by RFC 2606 and can never resolve, so no real input
 * can produce this origin except by being a same-origin path — which is the
 * whole test.
 */
const BASE = 'https://next.invalid';

/**
 * C0 controls, space, DEL, and any other Unicode whitespace. Written as escapes
 * rather than literals so the rule survives a copy-paste through an editor that
 * normalises invisible characters.
 */
// Matching control characters is the POINT of this expression, not an
// accident. `no-control-regex` exists to catch a `\x00` that reached a
// pattern by mistake; here the C0 range IS the payload being rejected,
// because a newline or a NUL smuggled into a `next` parameter is where
// header and redirect splitting start.
//
// The class had also degraded into LITERAL control bytes in the source —
// exactly what the comment above predicted would happen on a paste through
// an editor that normalises invisible characters, and invisible in a diff.
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u0020\u007F]|\s/u;

export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (FORBIDDEN.test(raw)) return null;
  if (!raw.startsWith('/')) return null;

  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }

  if (url.origin !== BASE) return null;

  // The normalised form, not the raw string: `/a/../b` becomes `/b` here rather
  // than at navigation time, so what was validated is what gets used.
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Appends a validated `next` to a destination. Used when a surface must hand
 * the parameter onward rather than act on it — login → onboarding, login →
 * register — so the visitor's original target survives a multi-step detour.
 *
 * Returns `to` untouched when there is nothing safe to carry, so call sites stay
 * a single expression with no conditional.
 */
export function withNext(to: string, next: string | null | undefined): string {
  const safe = safeNext(next);
  if (!safe) return to;
  return `${to}${to.includes('?') ? '&' : '?'}next=${encodeURIComponent(safe)}`;
}
