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

/** Browser-only: reads the CSRF cookie set by `proxy.ts`. Empty string on the server or if absent. */
export function readCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  for (const part of document.cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== CSRF_COOKIE) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return '';
}
