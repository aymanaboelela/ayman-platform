import { createHash, randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { THEME_SCRIPT } from './lib/security/theme-script';

/**
 * `proxy.ts`, not `middleware.ts` — the latter is deprecated in Next 16
 * (renamed; `middleware.ts` throws a build error now). Runs on Node.js only
 * (Next disallows an `edge` runtime here), so it can make a real outbound
 * fetch to verify the session against the API rather than guessing from the
 * cookie's mere presence.
 *
 * Owns three things per Task 8:
 *  1. The redirect matrix (anonymous/incomplete-onboarding route protection).
 *  2. Unconditional security headers + a Report-Only CSP, split nonce
 *     (authenticated) vs. static-optimization-preserving (public).
 *  3. Minting the `__Host-csrf` cookie every response reads/needs (S9) —
 *     see `../lib/csrf.ts` for the client-side half of this convention.
 */

const DEV = process.env.NODE_ENV !== 'production';

/**
 * Server-to-server only — this file never runs in the browser, so it talks
 * to the API's real origin directly rather than through the same-origin
 * `/api/*` rewrite `next.config.ts` sets up for the browser (Global
 * Constraint #1: that rewrite exists so the BROWSER only ever sees one
 * origin; it has no bearing on how our own server-side code reaches the
 * API). Mirrors `lib/api.ts`'s `SERVER_BASE`, kept as its own constant here
 * rather than imported — `lib/api.ts` also defines browser-only helpers
 * (`apiPatch`/`apiDelete`) this file has no reason to pull into its bundle.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3300';

/**
 * Every route prefix gated behind a session. A single exported constant so
 * later plans append to it instead of each hand-editing a private regex —
 * Plan 5 appends `/quizzes`.
 */
export const PROTECTED_PREFIXES = ['/dashboard', '/path', '/onboarding', '/settings', '/admin', '/quizzes'] as const;

/**
 * Plan 4: the course PLAYER, `/courses/:slug/lessons/:lessonId`. This can't
 * join `PROTECTED_PREFIXES` above — the array is matched with a literal
 * `startsWith`, and `:slug` is a wildcard — while `/courses` and
 * `/courses/:slug` (the public catalog and course detail page, Plan 3) must
 * stay unprotected. This is also load-bearing for CSP, not just the login
 * redirect: `loadYouTubeIframeApi()` relies on `'strict-dynamic'` to trust
 * the `<script src="https://www.youtube.com/iframe_api">` tag it injects,
 * and only `buildAuthenticatedCsp` sets `'strict-dynamic'` — the public
 * policy's plain `'unsafe-inline'` script-src does NOT cover an external
 * script src, so without this pattern the IFrame API load is a genuine
 * (observed) CSP violation, not a false alarm.
 */
const PROTECTED_LESSON_PATTERN = /^\/courses\/[^/]+\/lessons(?:\/|$)/;

export function isProtectedRoute(pathname: string): boolean {
  return (
    PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    PROTECTED_LESSON_PATTERN.test(pathname)
  );
}

function isOnboardingRoute(pathname: string): boolean {
  return pathname === '/onboarding' || pathname.startsWith('/onboarding/');
}

export interface AuthState {
  authenticated: boolean;
  onboardingCompleted: boolean;
}

export type RedirectDecision = 'login' | 'onboarding' | 'dashboard' | null;

/**
 * The redirect matrix as a PURE decision, deliberately separated from
 * `resolveRedirect`'s I/O (the API fetch, building an actual `URL`) so
 * every cell is a fast, fake-free unit test (`proxy.test.ts`) rather than
 * something only checkable by hand in a browser.
 *
 *   anonymous            → protected route                        ⇒ 'login'
 *   authenticated,
 *   onboarding incomplete → any OTHER protected route              ⇒ 'onboarding'
 *   authenticated,
 *   onboarding complete   → /onboarding                            ⇒ 'dashboard'
 *   anything else (including every public route, unconditionally) ⇒ null
 */
export function decideRedirect(pathname: string, auth: AuthState): RedirectDecision {
  if (!isProtectedRoute(pathname)) return null;

  if (!auth.authenticated) return 'login';

  if (!auth.onboardingCompleted && !isOnboardingRoute(pathname)) return 'onboarding';

  // Don't strand a fully onboarded student in a flow they already finished.
  if (auth.onboardingCompleted && isOnboardingRoute(pathname)) return 'dashboard';

  return null;
}

/**
 * `GET /api/profile/me` answers both questions this proxy needs in one
 * round trip: 401 means no session, 200 carries `onboardingCompleted`.
 * Cookies are forwarded manually — this is a server-to-server fetch, not a
 * browser request, so nothing attaches them automatically.
 *
 * S12 (fail closed): a network error, a non-OK/non-401 status, or a slow
 * API (3s timeout) are ALL treated as "not authenticated" — never as "let
 * them through". An outage in the API must not become an outage in route
 * protection.
 */
async function resolveAuthState(request: NextRequest): Promise<AuthState> {
  const cookie = request.headers.get('cookie');
  try {
    const response = await fetch(`${API_ORIGIN}/api/profile/me`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return { authenticated: false, onboardingCompleted: false };
    }

    const body = (await response.json()) as { onboardingCompleted?: unknown };
    return { authenticated: true, onboardingCompleted: body.onboardingCompleted === true };
  } catch {
    return { authenticated: false, onboardingCompleted: false };
  }
}

/**
 * The I/O half of the redirect matrix: resolves the real auth state (only
 * for protected routes — `decideRedirect` short-circuits before this is
 * ever needed for a public one) and turns the pure decision into an actual
 * destination `URL`.
 */
async function resolveRedirect(request: NextRequest): Promise<URL | null> {
  const { pathname } = request.nextUrl;
  if (!isProtectedRoute(pathname)) return null;

  const auth = await resolveAuthState(request);
  const decision = decideRedirect(pathname, auth);

  switch (decision) {
    case 'login': {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return loginUrl;
    }
    case 'onboarding':
      return new URL('/onboarding', request.url);
    case 'dashboard':
      return new URL('/dashboard', request.url);
    case null:
      return null;
  }
}

/** Quoted and ready to drop into a `script-src` directive. */
export const THEME_SCRIPT_HASH = `'sha256-${createHash('sha256').update(THEME_SCRIPT, 'utf8').digest('base64')}'`;

/** Identical on both the public and authenticated policies — most of the value lives here. */
function sharedCspDirectives(dev: boolean): string[] {
  const directives = [
    "default-src 'self'",
    // Next injects inline <style> for critical CSS, and a future settings
    // loader (Plan 6) renders branding as an inline `:root{...}` block —
    // neither is hashable, and style-src is a far weaker XSS vector than
    // script-src, so this stays 'unsafe-inline' on both policies.
    "style-src 'self' 'unsafe-inline'",
    // Ready for Plan 4's video work: YouTube thumbnails load from i.ytimg.com.
    "img-src 'self' blob: data: https://i.ytimg.com",
    "font-src 'self'",
    "media-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Videos are reconstructed server-side as youtube-nocookie embed URLs from
    // a stored 11-char id (SSRF-proof by construction, spec §7 P3).
    //
    // `'self'` is Plan 8's document viewer: a lesson's deck is framed from
    // `/api/lessons/../resources/../view`, which is on OUR origin because
    // `GET /media/:prefix/:name` is `@Public()` and can never carry content
    // gated on enrollment. Each of those responses ships its own
    // `default-src 'none'; sandbox` policy, so this widens WHO may be framed,
    // not what a framed document is allowed to do. `frame-ancestors 'none'`
    // above is untouched — nobody frames our pages.
    //
    // The viewer is an <iframe> and not an <object>/<embed> precisely because
    // `object-src 'none'` above would block those, and weakening object-src to
    // show a PDF would be a far worse trade than this one.
    "frame-src 'self' https://www.youtube-nocookie.com",
    dev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
    // report-uri is deprecated but still the only mechanism Safari/Firefox
    // implement; report-to is what Chrome honours. Ship both.
    'report-uri /api/security/csp-report',
    'report-to csp-endpoint',
  ];
  // Would silently rewrite http://localhost to https and break local dev.
  if (!dev) directives.push('upgrade-insecure-requests');
  return directives;
}

/**
 * Public, prerendered routes. `'unsafe-inline'` is deliberate, not a
 * shortcut: Next emits its own inline RSC/flight bootstrap scripts on every
 * page, their content differs per page and per build so THIS app cannot
 * hash them, and per CSP2+ the presence of ANY hash or nonce in `script-src`
 * makes browsers ignore `'unsafe-inline'` entirely — writing
 * `script-src 'self' 'sha256-…' 'unsafe-inline'` here would not "add" a
 * hash, it would silently DROP 'unsafe-inline' in every modern browser and
 * break Next's own bootstrap on every public page. A nonce has the same
 * problem, plus it forces dynamic rendering (disabling static optimization,
 * ISR and PPR) — exactly what the public catalog must keep. So the public
 * policy is intentionally the permissive half; `object-src`, `frame-src`,
 * `frame-ancestors` etc. above are where its real value is.
 */
export function buildPublicCsp(dev: boolean): string {
  const scriptSrc = ["script-src 'self' 'unsafe-inline'"];
  if (dev) scriptSrc.push("'unsafe-eval'");
  return [scriptSrc.join(' '), ...sharedCspDirectives(dev)].join('; ');
}

/**
 * Authenticated routes only (`isProtectedRoute`) — these already read
 * cookies via `resolveAuthState` above and are therefore dynamic anyway, so
 * a nonce costs nothing extra here that isn't already spent. The nonce
 * reaches Next through the REQUEST header literally named
 * `content-security-policy` (Next's own mechanism — see `proxy()` below),
 * which is what makes Next stamp `nonce=` on its own emitted scripts. The
 * one script THIS app authors (`THEME_SCRIPT`, un-nonced because the root
 * layout must never call `headers()` — that would make every page dynamic)
 * is pinned by its hash instead of the nonce.
 */
export function buildAuthenticatedCsp(nonce: string, dev: boolean): string {
  const scriptSrc = [`script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${THEME_SCRIPT_HASH}`];
  if (dev) scriptSrc.push("'unsafe-eval'");
  return [scriptSrc.join(' '), ...sharedCspDirectives(dev)].join('; ');
}

/**
 * Report-only, always, in this task — S3/Task 8's explicit instruction: a
 * strict CSP shipped blind will break the app, and flipping to enforcing
 * mode is deliberately NOT done here. `CSP_ENFORCE` is read but never set by
 * anything in this task; it exists only so a later task (after a quiet
 * report-only soak) can flip one env var instead of touching this file.
 */
const CSP_HEADER_NAME =
  process.env.CSP_ENFORCE === 'true' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';

/**
 * Headers that are unconditional and cheap — every response gets these,
 * redirects included. `dev` is an explicit parameter (not read from the
 * module-level `DEV` constant) so both branches — HSTS present/absent — are
 * directly unit-testable without mocking `process.env` at import time,
 * matching `buildPublicCsp`/`buildAuthenticatedCsp`'s own signature.
 */
export function applyBaseSecurityHeaders(headers: Headers, dev: boolean): void {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  );
  headers.set('X-DNS-Prefetch-Control', 'off');
  // Meaningless (and a no-op) over plain http://localhost; gated the same
  // way Task 1 gated the __Host- cookie prefix on production.
  if (!dev) {
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  // Chrome's Reporting API endpoint group referenced by `report-to` above.
  headers.set('Reporting-Endpoints', 'csp-endpoint="/api/security/csp-report"');
}

const CSRF_COOKIE = '__Host-csrf';

/**
 * Mints the double-submit CSRF cookie (S9) if the visitor doesn't already
 * have one — every response gets a chance to set it, so by the time any
 * page can submit a form the cookie already exists. Deliberately NOT
 * gated on `NODE_ENV` the way the session cookie is (Task 1): the
 * `__Host-` prefix REQUIRES `Secure`, full stop, and every later plan's
 * client code hardcodes the literal name `__Host-csrf` with no dev/prod
 * variant (see `docs/superpowers/plans/README.md`'s "CSRF and cookies"
 * section — "Three files reading three different names is a silent 403
 * storm"). Chrome and Firefox both treat `http://localhost` as a
 * potentially trustworthy origin and accept `Secure` cookies there; Safari
 * dev is a known gap, same category as Task 1's already-documented one for
 * the session cookie, accepted here for cross-plan consistency instead.
 * Not httpOnly: the client must be able to read it via `document.cookie`
 * to echo it in the `x-csrf-token` header (see `lib/csrf.ts`).
 */
function ensureCsrfCookie(request: NextRequest, response: NextResponse): void {
  if (request.cookies.has(CSRF_COOKIE)) return;
  response.cookies.set({
    name: CSRF_COOKIE,
    value: randomUUID(),
    httpOnly: false,
    secure: true,
    sameSite: 'strict',
    path: '/',
  });
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const redirectTarget = await resolveRedirect(request);
  if (redirectTarget) {
    const response = NextResponse.redirect(redirectTarget);
    applyBaseSecurityHeaders(response.headers, DEV);
    ensureCsrfCookie(request, response);
    return response;
  }

  const { pathname } = request.nextUrl;

  if (!isProtectedRoute(pathname)) {
    // No nonce, no request-header mutation: the response stays cacheable
    // and the route keeps its static optimization / PPR treatment.
    const response = NextResponse.next();
    applyBaseSecurityHeaders(response.headers, DEV);
    response.headers.set(CSP_HEADER_NAME, buildPublicCsp(DEV));
    ensureCsrfCookie(request, response);
    return response;
  }

  const nonce = Buffer.from(randomUUID()).toString('base64');
  const policy = buildAuthenticatedCsp(nonce, DEV);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next extracts the nonce from the REQUEST header named EXACTLY
  // `content-security-policy` and only from that name — during the
  // report-only soak the RESPONSE carries `-Report-Only`, so without this
  // line Next would stamp no nonces at all and every report would be a
  // false positive.  This header is never sent to the browser.
  requestHeaders.set('content-security-policy', policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applyBaseSecurityHeaders(response.headers, DEV);
  response.headers.set(CSP_HEADER_NAME, policy);
  ensureCsrfCookie(request, response);
  return response;
}

export const config = {
  matcher: [
    /**
     * Everything except Next's own static output, the image optimizer, and
     * static asset requests — none of which execute script or need route
     * protection, and all of which would otherwise pay for a proxy
     * invocation (including, for protected paths, an API round trip) per
     * request. `missing` skips Next's own internal prefetch requests, which
     * would otherwise double every navigation's cost for no benefit.
     */
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:webp|png|jpg|jpeg|svg|woff2)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
