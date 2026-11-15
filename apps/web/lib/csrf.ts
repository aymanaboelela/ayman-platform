/**
 * CSRF convention shared across every plan (see
 * `docs/superpowers/plans/README.md`'s "CSRF and cookies" section, which
 * every later plan's client code — Plan 3's `apiSend`, Plan 4's `apiPost` —
 * is written to match exactly): header `x-csrf-token`, double-submit value
 * read from the `__Host-csrf` cookie `proxy.ts` mints on every response.
 *
 * The header's VALUE is not the actual control — sending a custom header at
 * all is: a cross-site HTML form cannot add one, and a cross-origin fetch
 * that tries triggers a preflight the API never answers (no CORS is
 * configured anywhere). `apps/api`'s `CsrfGuard` (Task 8) only checks that
 * the header is present and non-empty, plus `Origin`/`Sec-Fetch-Site`. The
 * cookie value is still echoed here so the server COULD tighten this into a
 * real double-submit equality check later without any client-side change.
 */
export const CSRF_COOKIE = '__Host-csrf';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Browser-only: reads the CSRF cookie `proxy.ts` mints, minting it here when it
 * is absent. Empty string on the server.
 *
 * ⚠️ Absent is a normal state now, not a broken one. A public page served from
 * Cloudflare's cache carries no `Set-Cookie` — the proxy deliberately skips the
 * mint on edge-cacheable responses (`isEdgeCacheable` in `proxy.ts`), because a
 * cookie on a cached page would be stripped or would stop it being cached at
 * all. So a first-time visitor who lands on `/books` and orders straight away
 * reaches this with no cookie, and an empty header is exactly what `CsrfGuard`
 * rejects. The value itself is not the control (see above), so a fresh random
 * one written to the same cookie is equivalent to the proxy's.
 */
export function readCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  for (const part of document.cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== CSRF_COOKIE) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  const minted = crypto.randomUUID();
  // Same attributes as the proxy's mint. If the browser refuses the write
  // (Safari on http://localhost refuses `Secure`), the header still carries
  // the value, and the header is what the guard checks.
  document.cookie = `${CSRF_COOKIE}=${minted}; Path=/; Secure; SameSite=Strict`;
  return minted;
}
