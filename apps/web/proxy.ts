import { createHash, randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { buildAgentLinkHeader } from './lib/agents/discovery';
import {
  acceptsMarkdown,
  isMarkdownablePath,
  markdownRenderPath,
  pathFromMarkdownSuffix,
} from './lib/agents/markdown-routes';
import { JS_RUNNER_CSP, JS_RUNNER_PATH } from './lib/js-runner';
import { PREPAINT_SCRIPT } from './lib/security/prepaint-script';
import { stampPathname } from './lib/request-pathname';
import { safeNext } from './lib/safe-next';

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
 * Where uploaded files are served from — a DIFFERENT origin to this app by
 * architectural requirement (the API refuses to boot if the two match), which
 * is exactly why the CSP has to name it. Read from the same variable
 * `mediaUrl()` uses so the policy and the URLs it must allow cannot drift.
 *
 * `.replace(/\/$/, '')` because a CSP source with a trailing slash is a PATH
 * pattern, not an origin, and would silently match nothing.
 */
const MEDIA_ORIGIN = (process.env.NEXT_PUBLIC_MEDIA_ORIGIN ?? 'http://localhost:3300').replace(
  /\/$/,
  '',
);

/**
 * Every route prefix gated behind a session. A single exported constant so
 * later plans append to it instead of each hand-editing a private regex —
 * Plan 5 appends `/quizzes`.
 */
export const PROTECTED_PREFIXES = [
  '/dashboard',
  '/path',
  '/onboarding',
  '/settings',
  '/admin',
  '/quizzes',
  // Every route below renders inside the student shell and its page calls
  // `apiGetAuthed` unconditionally. Without an entry here an anonymous request
  // does not land on the sign-in page — it reaches the page, the authed fetch
  // 401s, and the visitor gets an error screen instead of a login form.
  '/library',
  '/profile',
  '/results',
  '/foundations',
  '/playground',
  /*
    `/notifications` was missing from this list until 2026-08-13, and it is the
    case the paragraph above already describes rather than a new one:
    `app/(app)/notifications/page.tsx` opens with an unconditional
    `apiGetAuthed('/api/me/notifications', …)`, so an anonymous visitor who
    followed a link there was never sent to sign in — the page rendered, the
    authed fetch 401'd, and they got an error screen where the login form
    should have been.

    It is reachable without a session: the reply-notification mail and the
    assistant's own «شوف الإشعارات» both point here, and either can be opened
    on a device that is not signed in.

    Worth recording, because it is what let the gap survive: adding
    `app/(app)/error.tsx` made the failure look INTENTIONAL. Before the error
    boundaries this was a bare unstyled crash, which reads as a bug; afterwards
    it is a considered Arabic panel saying something went wrong, which reads as
    handled. The boundary is right to have and it also raised the cost of
    noticing this — so the redirect is the fix, not the panel.

    `proxy.test.ts` now walks `app/(app)` and fails if any page calling
    `apiGetAuthed` has no entry here, so the next one is covered on the day it
    is written.
  */
  '/notifications',
] as const;

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

/**
 * `/login` and `/register`. Deliberately NOT members of `PROTECTED_PREFIXES` —
 * that would invert their meaning and lock out the only people who need them.
 * They are routes an ALREADY-authenticated visitor has no business seeing: a
 * stale bookmark, a "تسجيل الدخول" link tapped out of habit, or a browser
 * restoring a tab should land on the dashboard, not on an empty form that asks
 * a signed-in student to sign in again.
 *
 * This is the last piece of "don't make them log in every time"
 * (`docs/superpowers/specs/2026-08-03-login-gated-content-design.md` §6.4); the
 * 90-day session is the first.
 */
function isAuthRoute(pathname: string): boolean {
  return pathname === '/login' || pathname === '/register';
}

/**
 * `app/dev/*` — the design-system playground: `/dev/tokens`, `/dev/motion`,
 * `/dev/showpiece`, `/dev/taxonomy`.
 *
 * These were LIVE on the production domain, reachable by anyone, returning
 * 200. They are exempt from the no-literal-strings and route-coverage rules
 * precisely because they are internal, and two of them are worse than merely
 * untidy:
 *
 * · `/dev/taxonomy` awaits `apiGet('/api/taxonomy')` on every render with no
 *   `'use cache'` — by its own comment, deliberately, "to prove the request
 *   actually reaches Postgres on every load". Anonymous, uncacheable,
 *   unauthenticated database reads on a public URL are a free load amplifier.
 * · `/dev/showpiece` mounts a WebGL scene with `ssr: false`.
 *
 * `robots.txt` already disallows `/dev/`, but that only keeps them out of the
 * index — it does not stop a single request. This does, and it is a 404
 * rather than a redirect so nothing confirms the routes exist at all.
 */
export function isDevOnlyRoute(pathname: string): boolean {
  return pathname === '/dev' || pathname.startsWith('/dev/');
}


export interface AuthState {
  authenticated: boolean;
  onboardingCompleted: boolean;
}

export type RedirectDecision = 'login' | 'onboarding' | 'dashboard' | 'next' | null;

/**
 * The redirect matrix as a PURE decision, deliberately separated from
 * `resolveRedirect`'s I/O (the API fetch, building an actual `URL`) so
 * every cell is a fast, fake-free unit test (`proxy.test.ts`) rather than
 * something only checkable by hand in a browser.
 *
 *   anonymous            → protected route                        ⇒ 'login'
 *   anonymous            → /login, /register                      ⇒ null
 *   authenticated,
 *   onboarding incomplete → any OTHER protected route              ⇒ 'onboarding'
 *   authenticated,
 *   onboarding incomplete → /login, /register                      ⇒ 'onboarding'
 *   authenticated,
 *   onboarding complete   → /onboarding                            ⇒ 'dashboard'
 *   authenticated,
 *   onboarding complete   → /login, /register                      ⇒ 'next'
 *   anything else (including every public route, unconditionally) ⇒ null
 *
 * `'next'` means "wherever `?next=` points, or the dashboard" — resolved in
 * `resolveRedirect`, which is the half that owns URLs. Keeping it as a decision
 * rather than a URL is what lets this stay a pure function.
 */
export function decideRedirect(pathname: string, auth: AuthState): RedirectDecision {
  // Auth routes first: they are the one case where being authenticated is what
  // triggers a redirect, so they cannot ride on `isProtectedRoute` below.
  if (isAuthRoute(pathname)) {
    if (!auth.authenticated) return null;
    // Onboarding still outranks everything, exactly as it does for a protected
    // route — a signed-in visitor with no profile has one place to be.
    return auth.onboardingCompleted ? 'next' : 'onboarding';
  }

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
  // Auth routes need the auth state too — for them the redirect fires when the
  // visitor IS authenticated, which is the opposite trigger to every other row
  // of the matrix, so they cannot be short-circuited away here.
  if (!isProtectedRoute(pathname) && !isAuthRoute(pathname)) return null;

  const auth = await resolveAuthState(request);
  const decision = decideRedirect(pathname, auth);

  switch (decision) {
    case 'login': {
      const loginUrl = new URL('/login', request.url);
      // Carries the FULL target including its query string: a student bounced
      // off `/quizzes/x/attempt?resume=1` should land back on exactly that, not
      // on a stripped version of it.
      loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      return loginUrl;
    }
    case 'onboarding': {
      const onboardingUrl = new URL('/onboarding', request.url);
      // Forward an existing `next` so the chain login → onboarding → target
      // survives; `safeNext` on the receiving page is what makes accepting it
      // safe, and this never invents one.
      const pending = safeNext(request.nextUrl.searchParams.get('next'));
      if (pending) onboardingUrl.searchParams.set('next', pending);
      return onboardingUrl;
    }
    case 'dashboard':
      return new URL('/dashboard', request.url);
    case 'next': {
      // An authenticated, onboarded visitor who landed on /login or /register.
      // `safeNext` is the only reason reflecting a query parameter into a
      // redirect is safe here — an unvalidated `next` would make this proxy the
      // open redirect the forms were careful not to be.
      const target = safeNext(request.nextUrl.searchParams.get('next')) ?? '/dashboard';
      return new URL(target, request.url);
    }
    case null:
      return null;
  }
}

/** Quoted and ready to drop into a `script-src` directive. */
export const PREPAINT_SCRIPT_HASH = `'sha256-${createHash('sha256').update(PREPAINT_SCRIPT, 'utf8').digest('base64')}'`;

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
    // ⚠️ `MEDIA_ORIGIN` is NOT optional here, and `'self'` does not cover it.
    //
    // Every uploaded asset — course covers, avatars, the admin's logo and
    // favicon — is rendered as `<img src={mediaUrl(key)}>`, and `mediaUrl()`
    // builds `${NEXT_PUBLIC_MEDIA_ORIGIN}/media/<key>`. That is a DIFFERENT
    // ORIGIN by architectural requirement (the API refuses to boot if it
    // matches APP_URL), so under an ENFORCED policy an `img-src` of `'self'`
    // blocks all of it. The catalogue happened to be empty when enforcement
    // was first switched on, which is the only reason this did not show up as
    // a wall of broken images.
    // ⚠️ `c.clarity.ms` is Clarity's tracking PIXEL, and it is a third distinct
    // host from the two named elsewhere in this file (the tag host in
    // `script-src`, the collector wildcard in `connect-src`). It is fetched as
    // an <img>, so neither of those directives covers it, and an enforced
    // policy blocks it with `Loading the image 'https://c.clarity.ms/c.gif'
    // violates ... img-src`. Measured in production 2026-08-15.
    // ⚠️ `c.bing.com` is Clarity's THIRD host and its second pixel, and it is
    // named in `connect-src` below — where it does nothing, because it is
    // fetched as an <img>, not over `fetch`. Measured on production
    // 2026-08-15, after the other two Clarity hosts were fixed:
    //
    //   Loading the image 'https://c.bing.com/c.gif?ctsa=mr&CtsSyncId=…'
    //   violates ... "img-src 'self' blob: data: https://i.ytimg.com
    //   https://c.clarity.ms https://media.aymanaboelela.com"
    //
    // That is the same mistake as the tag/recorder split, made a second time:
    // a host was allowed in the directive someone assumed it would use rather
    // than the one it actually uses. Its entry in `connect-src` is left alone —
    // harmless, and removing it would only invite the reverse error later.
    `img-src 'self' blob: data: https://i.ytimg.com https://c.clarity.ms https://c.bing.com ${MEDIA_ORIGIN}`,
    "font-src 'self'",
    // Same reasoning for uploaded audio/video served from the media origin.
    `media-src 'self' ${MEDIA_ORIGIN}`,
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
    //
    // The two Google hosts are the Drive/Docs `/preview` viewer, for a lesson
    // material an instructor pasted as a plain «رابط». Same trade as the line
    // above: this says what WE may embed, and `frame-ancestors 'none'` still
    // says nobody embeds us. The URL is rebuilt from an extracted id against a
    // hardcoded origin (`driveEmbedUrl`), never echoed from stored input — so
    // widening the policy does not widen what can be pointed at.
    "frame-src 'self' https://www.youtube-nocookie.com https://drive.google.com https://docs.google.com",
    // ⚠️ `static.cloudflareinsights.com` is not a dependency this app chose.
    // Cloudflare INJECTS its Web Analytics beacon into the HTML at the edge,
    // after the origin has responded — so it appears in the browser and never
    // in the origin's own output, which is why `curl` on the origin shows no
    // trace of it. `'unsafe-inline'` does not cover an external `src`, so
    // under an ENFORCED policy the browser blocks it.
    //
    // Listing it is the honest fix: a policy that silently breaks the site
    // owner's analytics is a policy nobody dares switch on, and this is a
    // first-party Cloudflare host on a site already behind Cloudflare. To drop
    // it instead, turn off Web Analytics in the Cloudflare dashboard — do not
    // just delete this line and leave the injection running.
    //
    // Microsoft Clarity uploads what it records over `fetch`, and NOT to the
    // host it was served from: the tag comes from `www.clarity.ms` but the
    // payloads go to a regional collector (`*.clarity.ms`) and to
    // `c.bing.com`. Naming only the script host makes the tag load, run, and
    // then fail to upload a single session — the dashboard says "no data"
    // while the browser console holds the answer. The wildcard is unavoidable
    // here; Clarity picks the subdomain itself.
    dev
      ? "connect-src 'self' ws: wss:"
      : "connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com https://*.clarity.ms https://c.bing.com",
    // report-uri is deprecated but still the only mechanism Safari/Firefox
    // implement; report-to is what Chrome honours. Ship both.
    'report-uri /api/security/csp-report',
    'report-to csp-endpoint',
  ];
  // Two separate reasons this is conditional.
  //
  // `dev` — it would silently rewrite http://localhost to https and break
  // local development.
  //
  // `CSP_ENFORCING` — the spec says `upgrade-insecure-requests` is IGNORED in
  // a report-only policy, and Chrome does not ignore it quietly: it logs "The
  // Content Security Policy directive 'upgrade-insecure-requests' is ignored
  // when delivered in a report-only policy" once per navigation, in every
  // visitor's console, on every page. Since `CSP_ENFORCE` has never been set
  // (see `CSP_HEADER_NAME` below), that warning is the directive's ONLY
  // observable effect today.
  //
  // Dropping it costs nothing, because a directive the browser ignores was
  // protecting nothing — and it returns by itself the moment `CSP_ENFORCE`
  // flips, which is the first moment it would do any work.
  if (!dev && CSP_ENFORCING) directives.push('upgrade-insecure-requests');
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
  const scriptSrc = [
    // `'wasm-unsafe-eval'` is for the Python playground, and it is the NARROW
    // keyword on purpose: it permits WebAssembly compilation and nothing else,
    // unlike `'unsafe-eval'`, which would also re-open `eval` and
    // `new Function` for every script on every page. Pyodide instantiates a
    // 9.6 MB wasm module (`public/python-worker.js`); without this the
    // playground dies the moment CSP is enforced, and dies silently, because
    // the failure is a worker-level error nobody is watching for.
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    // Cloudflare injects its Web Analytics beacon into the HTML at the EDGE,
    // after the origin has responded — see the connect-src note above.
    // `'unsafe-inline'` does not cover an external `src`, so the host must be
    // named or an enforced policy blocks it.
    'https://static.cloudflareinsights.com',
    // ⚠️ `loadYouTubeIframeApi()` injects <script src="https://www.youtube.com/iframe_api">.
    // This used to be covered on authenticated routes by `'strict-dynamic'`,
    // which trusts anything a trusted script loads. That keyword is gone (see
    // `buildAuthenticatedCsp` for why), so the host is now named explicitly —
    // without this line every lesson video breaks the moment CSP is enforced.
    'https://www.youtube.com',
    // Microsoft Clarity's tag, injected by `@microsoft/clarity` from
    // `components/analytics/clarity.tsx`. Same story as the two hosts above:
    // it is an external `src`, and `'unsafe-inline'` says nothing about those.
    // Its UPLOAD hosts are separate and live in `connect-src` — see the note
    // there before removing either half, because naming one without the other
    // produces a tag that runs and records and never delivers.
    'https://www.clarity.ms',
    // ⚠️ AND `scripts.clarity.ms`, which is NOT the same host and is the one
    // that actually does the recording. `@microsoft/clarity` loads
    // `www.clarity.ms/tag/<projectId>` — a small loader — and THAT script then
    // injects `https://scripts.clarity.ms/<version>/clarity.js`. Naming only
    // the tag host lets stage one run and blocks stage two, so Clarity reports
    // no error of its own and simply records nothing.
    //
    // Measured on production 2026-08-15, with `CSP_ENFORCE` on:
    //   Loading the script 'https://scripts.clarity.ms/0.8.69/clarity.js'
    //   violates the following Content Security Policy directive: "script-src
    //   ... https://www.clarity.ms"
    //
    // The version is in the path, so this cannot be pinned any tighter than the
    // host. Do not "simplify" the two lines into `https://*.clarity.ms`: the
    // collector wildcard in `connect-src` is forced (Clarity picks the
    // subdomain at runtime), but the two script hosts are both known and naming
    // them keeps a wildcard out of `script-src`, which is the directive that
    // actually matters for XSS.
    'https://scripts.clarity.ms',
  ];
  if (dev) scriptSrc.push("'unsafe-eval'");
  return [scriptSrc.join(' '), ...sharedCspDirectives(dev)].join('; ');
}

/**
 * Authenticated routes (`isProtectedRoute`).
 *
 * ⚠️ IDENTICAL to the public policy, and the nonce parameter is accepted but
 * DELIBERATELY UNUSED. This is not laziness — it is the result of switching
 * `CSP_ENFORCE=true` on in production and watching the admin die.
 *
 * What happened: the policy said
 * `script-src 'self' 'nonce-…' 'strict-dynamic' <theme-hash>`, and the browser
 * blocked **every single Next chunk** plus Next's inline bootstrap. Under
 * `'strict-dynamic'` host-based allowlisting is disabled, so `'self'` counts
 * for nothing and ONLY nonce-matched scripts run — and Next's script tags
 * carried no nonce at all.
 *
 * The reason they carried none is `cacheComponents: true` in
 * `next.config.ts`. Next serves these routes from a prerendered/cached HTML
 * shell, and a cached shell cannot carry a per-request value: the proxy mints
 * a fresh nonce on every request while the HTML holds a stale one or none.
 * The two can never agree. The old comment here claimed a nonce "costs
 * nothing extra" because these routes are dynamic anyway — that reasoning
 * predates Cache Components and is simply no longer true.
 *
 * Report-only mode hid this completely: the violations were reported, nothing
 * was blocked, and the policy looked ready to enforce. It was not.
 *
 * So the honest trade, taken knowingly: ONE permissive-script policy
 * everywhere, actually ENFORCED, instead of a strict one that can only ever be
 * reported. `'unsafe-inline'` means an injected `<script>` still runs — that
 * protection is simply not available while the shell is cached. What
 * enforcement does buy is real and was buying nothing before:
 *
 *   · `base-uri 'self'`    — an injected `<base>` cannot re-point every
 *                            relative URL on the page at an attacker.
 *   · `form-action 'self'` — an injected form cannot POST a student's
 *                            credentials to another origin.
 *   · `connect-src`        — narrows where a successful XSS could exfiltrate.
 *   · `object-src 'none'`, `frame-ancestors 'none'`, `img-src`, `font-src`.
 *
 * To get strict script-src back, the shell must stop being cached for these
 * routes (drop `cacheComponents`, or opt the authenticated segments out) —
 * then, and only then, restore the nonce and `'strict-dynamic'`. Do not
 * restore them while this comment is still accurate.
 */
export function buildAuthenticatedCsp(_nonce: string, dev: boolean): string {
  return buildPublicCsp(dev);
}

/**
 * Report-only, always, in this task — S3/Task 8's explicit instruction: a
 * strict CSP shipped blind will break the app, and flipping to enforcing
 * mode is deliberately NOT done here. `CSP_ENFORCE` is read but never set by
 * anything in this task; it exists only so a later task (after a quiet
 * report-only soak) can flip one env var instead of touching this file.
 */
const CSP_ENFORCING = process.env.CSP_ENFORCE === 'true';

const CSP_HEADER_NAME = CSP_ENFORCING
  ? 'Content-Security-Policy'
  : 'Content-Security-Policy-Report-Only';

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
    // Beyond the hardware five, these shut off the ambient-capability APIs a
    // successful XSS would otherwise reach for: `interest-cohort` (topics),
    // `browsing-topics`, `serial`/`bluetooth`/`hid`/`midi` (device access) and
    // `display-capture` (screen recording during a graded attempt).
    // `fullscreen` is the one capability GRANTED rather than denied, and it is
    // listed explicitly for a reason: its default allowlist is `self`, so the
    // player's cross-origin `youtube-nocookie.com` frame could not enter
    // fullscreen no matter what the iframe asked for. On a phone that is the
    // difference between watching a lecture and squinting at a strip of it —
    // «وأنا بشوف الفيديو على يوتيوب لما بضغط عليه ما أقدرش إن هو يلف عشان يبقى
    // بعرض الفيديو كامل». Named origin, not `*`.
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), midi=(), display-capture=(), browsing-topics=(), interest-cohort=(), fullscreen=(self "https://www.youtube-nocookie.com")',
  );
  headers.set('X-DNS-Prefetch-Control', 'off');
  /**
   * Redundant with `frame-ancestors 'none'` in the CSP — on purpose. During
   * the report-only soak the CSP is NOT enforced, so `frame-ancestors` is
   * currently reporting clickjacking rather than preventing it, and this
   * header is the only thing actually stopping the page from being framed.
   * It stays after the flip too: it costs 22 bytes and covers the browsers
   * that never implemented `frame-ancestors`.
   */
  headers.set('X-Frame-Options', 'DENY');
  /**
   * Severs the `window.opener` link and puts the page in its own browsing
   * context group, which is what stops a page opened from ours (or one that
   * opened ours) from reaching into it via `window.opener`/named targets.
   *
   * `same-origin-allow-popups`, not the stricter `same-origin`: the value has
   * to tolerate cross-origin popups the app legitimately opens. Nothing here
   * sets `Cross-Origin-Embedder-Policy` — that would break the YouTube embed,
   * which is not worth a control we do not otherwise need.
   */
  headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  /**
   * ⚠️ `same-site`, NOT `same-origin`. Media is served from
   * `media.aymanaboelela.com` while the app is on `aymanaboelela.com` — a
   * DIFFERENT ORIGIN by design (the API refuses to boot if the two match),
   * but the same SITE. `same-origin` here would block every course cover,
   * avatar and lesson attachment the app renders.
   */
  headers.set('Cross-Origin-Resource-Policy', 'same-site');
  // Meaningless (and a no-op) over plain http://localhost; gated the same
  // way Task 1 gated the __Host- cookie prefix on production.
  if (!dev) {
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  // Chrome's Reporting API endpoint group referenced by `report-to` above.
  headers.set('Reporting-Endpoints', 'csp-endpoint="/api/security/csp-report"');
}

/**
 * Markdown for Agents: should THIS request be served markdown instead of the
 * React page, and from which internal route?
 *
 * Exported for `proxy.test.ts` — the interesting cases are all negative
 * (a browser's `Accept` must never match; `/courses/x/lessons/y.md` must never
 * become a way around the player's session gate) and none of them are
 * checkable by eye.
 *
 * Returns the rewrite target, or `null` to serve the page normally.
 */
export function resolveMarkdownRewrite(pathname: string, accept: string | null): string | null {
  // A `.md` URL is an unambiguous request — no `Accept` negotiation needed,
  // which is exactly why it exists: it survives being pasted into a chat box.
  const fromSuffix = pathFromMarkdownSuffix(pathname);
  if (fromSuffix !== null) {
    // `/foo.md` where `/foo` has no markdown twin falls through to a normal
    // 404 rather than rendering an empty document.
    return isMarkdownablePath(fromSuffix) ? markdownRenderPath(fromSuffix) : null;
  }

  if (isMarkdownablePath(pathname) && acceptsMarkdown(accept)) {
    return markdownRenderPath(pathname);
  }

  return null;
}

/**
 * The `Link` header, plus this page's markdown twin as `rel="alternate"`.
 *
 * ⚠️ It deliberately does NOT try to add `Vary: Accept` here, and that is a
 * measured finding rather than an oversight. On a PAGE response Next owns the
 * `Vary` header outright — it emits its own
 * (`rsc, next-router-state-tree, next-router-prefetch, …`) and neither a
 * `headers.append()` from this proxy nor a `headers()` entry in
 * `next.config.ts` survives it. Both were tried against a real production
 * build (`next build` + the standalone server, not `next dev`) and neither
 * appeared on the wire.
 *
 * `Link` behaves differently and does survive — Next appends its font
 * preloads as a SECOND `Link` header rather than replacing ours, which is why
 * that half works.
 *
 * Why the site is nonetheless safe without it: the MARKDOWN responses do carry
 * `Vary: Accept` (set in the rewrite branch below and again by
 * `app/md/[[...slug]]/route.ts`, and verified present in production). That is
 * the direction that matters. A shared cache stores the markdown keyed on
 * `Accept: text/markdown`, so a browser — which never sends that — cannot be
 * handed it. The remaining case is the harmless one: an agent served a cached
 * HTML page instead of markdown, which it simply reads as HTML.
 *
 * If Next ever stops stamping `Vary` on page responses, add `Accept` here.
 * Until then a call that is silently dropped is worse than none: it reads, to
 * the next maintainer, as though the header were being sent.
 */
/*
 * ⚠️ There is deliberately no `applyAgentDiscoveryHeaders` any more, and no
 * `Link` header on PAGE responses at all.
 * `components/agents/agent-discovery-links.tsx` renders the same relations
 * into `<head>` on the public shell instead. Do not put them back here.
 *
 * The header could not be made to stop growing from this file. It was applied
 * to every public route — the routes that HAVE a cached shell — and Next folds
 * a proxy's headers into that stored shell by appending, so each revalidation
 * added another whole copy to the stored entry. Measured on production
 * 2026-08-06: +2595 bytes every five minutes, dead constant, which is 519 a
 * minute, which is exactly one copy of the value plus its `, ` separator. It
 * reached 16522 bytes; `fetch` refuses a response over 16KB of headers, the
 * container healthcheck used `fetch`, and Traefik stopped routing to a
 * container that was serving perfectly well.
 *
 * `headers.delete('Link')` before `set` was tried FIRST and shipped to
 * production, and the growth continued at a byte-identical rate. The
 * accumulation happens after the proxy hands its response over, so nothing
 * done to this `Headers` object can reach it.
 *
 * The markdown branch below still sets `Link` and that is fine: a rewrite to a
 * route handler is not a cached page shell, and its size is asserted in
 * `e2e/agent-discovery.e2e.ts` rather than assumed.
 *
 * ## Where the copies actually come from, and why `next.config.ts` is no escape
 *
 * Found 2026-08-12, while answering a readiness report that asked for the
 * header back. `app-render.js`'s `setMetadataHeader` is
 * `metadata.headers[name] = res.getHeader(name)`, and it runs when React
 * appends its font preloads — so it captures whatever is on the OUTGOING
 * response at that moment into the entry that gets stored. That is the whole
 * mechanism: not middleware specifically, just "anything already on `res`".
 *
 * Which means `next.config.ts` `async headers()` shares the fate, and it was
 * measured rather than assumed — patched into a real standalone build's
 * `routes-manifest.json`, one forced revalidation took the stored value from
 * one copy to two. `router-server.js` applies config headers with
 * `res.setHeader` before the render, so they are on `res` in time to be caught
 * too.
 *
 * So there is no in-app place to put this header. The relations are published
 * from Cloudflare, which the origin's cache never sees:
 * `deploy/cloudflare/apply-link-header.mjs`.
 */

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
  /*
   * The JavaScript playground's worker, and the ONE response in this app that
   * is allowed to evaluate a string.
   *
   * Before everything else, because it is a static script with no session, no
   * redirect matrix and no reason to pay for an auth round trip.
   *
   * ## Why it needs its own policy at all
   *
   * `script-src` on every page is `'self' 'unsafe-inline' 'wasm-unsafe-eval'`.
   * That narrow wasm keyword is deliberate (see `buildPublicCsp`): Pyodide can
   * compile WebAssembly, and `eval`/`new Function` stay shut for every script
   * on every page. The JS playground needs exactly the thing that is shut.
   *
   * It used to start its worker from a `blob:` URL, which INHERITS the
   * document's policy — so «شغّل» on the JavaScript tab printed the CSP error
   * instead of the student's output. Only in production: `buildPublicCsp` adds
   * `'unsafe-eval'` under `dev`, so every local check passed.
   *
   * A worker started from a same-origin URL takes its policy from THIS
   * response instead. So the permission is confined to one thread that has no
   * DOM, no app state, and no network (`public/js-runner.js` deletes `fetch`,
   * `XMLHttpRequest`, `importScripts`, `WebSocket` and `EventSource` at startup,
   * before any message can arrive).
   *
   * `default-src 'none'` is the rest of the answer: this worker may evaluate a
   * string and do NOTHING else — it cannot fetch, connect, import another
   * script or spawn a nested worker, whatever the student pastes into it.
   */
  if (request.nextUrl.pathname === JS_RUNNER_PATH) {
    const response = NextResponse.next();
    applyBaseSecurityHeaders(response.headers, DEV);
    // Enforced, never report-only. A report-only policy here would grant the
    // capability while pretending to consider it — and the whole point of this
    // response is that the capability is granted deliberately and narrowly.
    response.headers.set('Content-Security-Policy', JS_RUNNER_CSP);
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  }

  // Before the auth round trip: the playground is not a protected route, it
  // is a route that must not exist here at all. See `isDevOnlyRoute`.
  if (!DEV && isDevOnlyRoute(request.nextUrl.pathname)) {
    const response = new NextResponse(null, { status: 404 });
    applyBaseSecurityHeaders(response.headers, DEV);
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  }

  /**
   * Before the auth round trip, and deliberately so: every markdown-able path
   * is public (`isMarkdownablePath` only ever matches routes absent from
   * `PROTECTED_PREFIXES`, asserted in `markdown-routes.test.ts`), so
   * `resolveRedirect` would return `null` for all of them anyway — running it
   * first would only add a fetch to `/api/profile/me` on a route that can
   * never redirect.
   */
  const markdownTarget = resolveMarkdownRewrite(
    request.nextUrl.pathname,
    request.headers.get('accept'),
  );
  if (markdownTarget) {
    const response = NextResponse.rewrite(new URL(markdownTarget, request.url));
    applyBaseSecurityHeaders(response.headers, DEV);
    response.headers.set(CSP_HEADER_NAME, buildPublicCsp(DEV));
    // No `rel="alternate"` here: this response IS the markdown, and a link
    // relation pointing a client at the document it already has is noise.
    response.headers.set('Link', buildAgentLinkHeader(null));
    response.headers.append('Vary', 'Accept');
    ensureCsrfCookie(request, response);
    return response;
  }

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
    // and the route keeps its static optimization / PPR treatment. That is
    // also why the pathname stamped on the protected branch below is stamped
    // only there — `lib/request-pathname.ts` documents what its absence means
    // to the routes that read it.
    const response = NextResponse.next();
    applyBaseSecurityHeaders(response.headers, DEV);
    response.headers.set(CSP_HEADER_NAME, buildPublicCsp(DEV));
    // Discovery relations are `<link>` elements on the public shell now, not a
    // header set from here — see the block above `CSRF_COOKIE` for why.
    ensureCsrfCookie(request, response);
    return response;
  }

  /**
   * No nonce is minted here any more, and the `content-security-policy`
   * REQUEST header that used to make Next stamp nonces is no longer set.
   *
   * Both were removed together with `'strict-dynamic'` — see
   * `buildAuthenticatedCsp`. Keeping them would be worse than useless: the
   * nonce could never match a cached HTML shell, so it bought no protection,
   * while still costing a `randomUUID()` per request and reading, to anyone
   * maintaining this, as though strict script-src were in force.
   *
   * ## What IS forwarded, and why it has to come from here
   *
   * The pathname. `(app)/layout.tsx` builds the rail's course list, the unread
   * count and the account menu for every route in the group, and
   * `student-shell.tsx` then throws all three away on
   * `/quizzes/:lessonId/attempt/:attemptId` — the runner owns that viewport.
   * That is a CLIENT decision arriving after the fact: the layout has already
   * rendered those Server Components, at the cost of `/api/me/dashboard` (the
   * heaviest endpoint in the app), `/api/session` and the notification count,
   * out of the student's rate-limit budget, at the moment the runner is loading
   * questions, on a phone, on a timer.
   *
   * A Server Component cannot ask what URL it is on, and this proxy is the only
   * thing in the request path that knows. It is one header, on the branch that
   * is dynamic anyway. `stampPathname` clones rather than replaces the incoming
   * headers, which is load-bearing — see `lib/request-pathname.ts` for what
   * Next does to the ones you do not hand back.
   */
  const response = NextResponse.next({
    request: { headers: stampPathname(request.headers, pathname) },
  });
  applyBaseSecurityHeaders(response.headers, DEV);
  response.headers.set(CSP_HEADER_NAME, buildAuthenticatedCsp('', DEV));
  /**
   * The third and last layer keeping the signed-in area out of search results,
   * and the only one that does not depend on a page rendering correctly:
   *
   *   1. `robots.txt`  — a crawl hint. Does not prevent indexing.
   *   2. `<meta name="robots" noindex>` — from `privateRouteMetadata` on the
   *      (app)/(admin)/(auth) layouts. Requires the HTML to actually render.
   *   3. this header   — applies to EVERY response on a protected path,
   *      including redirects, JSON, RSC payloads and error pages, none of
   *      which carry a `<meta>` tag at all.
   *
   * None of the three is a security control. `resolveRedirect` above and the
   * API's deny-by-default guard are.
   */
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
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
