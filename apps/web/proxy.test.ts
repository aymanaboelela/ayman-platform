import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PREPAINT_SCRIPT } from './lib/security/prepaint-script';
import {
  PREPAINT_SCRIPT_HASH,
  applyBaseSecurityHeaders,
  buildAuthenticatedCsp,
  buildPublicCsp,
  courseSlugFromPath,
  decideRedirect,
  isAdminRoute,
  isDevOnlyRoute,
  isProtectedRoute,
  resolveMarkdownRewrite,
  type AuthState,
} from './proxy';

const directive = (policy: string, name: string): string =>
  policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `) || part === name) ?? '';

/**
 * Every `(app)` page that opens with an unconditional `apiGetAuthed` must be
 * behind `PROTECTED_PREFIXES`.
 *
 * Written after `/notifications` was found missing from that array while its
 * page fetched authed on the first line. The consequence is not a 404 or a
 * redirect loop, which is why it survived: the anonymous visitor REACHES the
 * page, the fetch 401s, and they get an error screen where the sign-in form
 * should have been. The prose above the array had described exactly this
 * failure for five other routes; the array had simply fallen behind the app.
 *
 * A per-route assertion would have caught that one route. This walks the
 * directory instead, so the NEXT authed page is covered on the day it is
 * written rather than the day someone reports the error screen.
 *
 * Two deliberate exemptions, both structural rather than convenient:
 *
 *   · A path with a `[dynamic]` segment cannot be expressed here at all —
 *     `isProtectedRoute` matches with a literal `startsWith`, and `/library`
 *     protects `/library/[slug]` by prefix anyway. The player
 *     (`/courses/:slug/lessons/:lessonId`) is the one case where the prefix
 *     would over-match a public route, and `proxy.ts` documents its separate
 *     regex at length directly below the array.
 *   · The test reads the SOURCE rather than importing the pages: importing a
 *     Server Component pulls its whole data layer into the test process, and
 *     the question here is only "which files name this function".
 */
function authedAppRoutes(): string[] {
  const root = join(__dirname, 'app', '(app)');
  const found: string[] = [];

  const walk = (dir: string, route: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(next, `${route}/${entry.name}`);
      } else if (entry.name === 'page.tsx' && readFileSync(next, 'utf8').includes('apiGetAuthed')) {
        found.push(route === '' ? '/' : route);
      }
    }
  };

  walk(root, '');
  // Dynamic segments are covered by their static parent's prefix; see above.
  return found.filter((r) => !r.includes('['));
}

describe('every authed (app) page is behind the redirect', () => {
  it('has a PROTECTED_PREFIXES entry for each one', () => {
    const unprotected = authedAppRoutes().filter((route) => !isProtectedRoute(route));
    expect(
      unprotected,
      `these (app) pages call apiGetAuthed but are not protected — an anonymous visitor reaches the page, the fetch 401s, and they get an error screen instead of the sign-in form: ${unprotected.join(', ')}`,
    ).toEqual([]);
  });

  it('finds the pages at all, so the walk cannot pass by finding nothing', () => {
    // Without this, a rename of `app/(app)` turns the assertion above into a
    // test that always passes over an empty list.
    //
    // Anchored on routes rather than a count: the count moves whenever a page
    // is added or a segment becomes dynamic, and a threshold that has to be
    // re-tuned is one someone eventually raises to make a build go green.
    // `/dashboard` and `/notifications` both fetch authed and neither has a
    // dynamic segment, so both survive the filter by construction.
    const routes = authedAppRoutes();
    expect(routes).toContain('/dashboard');
    expect(routes).toContain('/notifications');
  });
});

describe('isProtectedRoute', () => {
  it('matches the three Plan 2 prefixes and their sub-paths', () => {
    expect(isProtectedRoute('/dashboard')).toBe(true);
    expect(isProtectedRoute('/dashboard/courses/1')).toBe(true);
    expect(isProtectedRoute('/onboarding')).toBe(true);
    expect(isProtectedRoute('/settings')).toBe(true);
    expect(isProtectedRoute('/settings/devices')).toBe(true);
  });

  it('does not match public routes, including near-miss prefixes', () => {
    expect(isProtectedRoute('/')).toBe(false);
    expect(isProtectedRoute('/login')).toBe(false);
    expect(isProtectedRoute('/register')).toBe(false);
    expect(isProtectedRoute('/courses')).toBe(false);
    expect(isProtectedRoute('/courses/python-basics')).toBe(false);
    // A route that merely starts with the same letters is not protected.
    expect(isProtectedRoute('/dashboardish')).toBe(false);
    expect(isProtectedRoute('/settingsy')).toBe(false);
  });

  it('matches Plan 5’s quiz runner, /quizzes/:lessonId and its sub-paths', () => {
    expect(isProtectedRoute('/quizzes')).toBe(true);
    expect(isProtectedRoute('/quizzes/abc-123')).toBe(true);
    expect(isProtectedRoute('/quizzes/abc-123/attempt/xyz')).toBe(true);
    expect(isProtectedRoute('/quizzesish')).toBe(false);
  });

  it('matches Plan 4’s course player, /courses/:slug/lessons/:lessonId, despite the dynamic slug', () => {
    expect(isProtectedRoute('/courses/python-basics/lessons')).toBe(true);
    expect(isProtectedRoute('/courses/python-basics/lessons/abc-123')).toBe(true);
    expect(isProtectedRoute('/courses/some-other-slug/lessons/xyz')).toBe(true);
    // A course whose slug happens to CONTAIN "lessons" must not false-match.
    expect(isProtectedRoute('/courses/lessons-101')).toBe(false);
  });
});

describe('courseSlugFromPath — which URLs the enrolled-student redirect may fire on', () => {
  it('matches the public course page and returns its slug', () => {
    expect(courseSlugFromPath('/courses/python-basics')).toBe('python-basics');
  });

  it('returns the segment still percent-encoded, because the redirect rebuilds a URL from it', () => {
    // Re-encoding this would produce `/library/%25d8%25a7…` — a 404 that looks
    // like the course was deleted.
    expect(courseSlugFromPath('/courses/%d8%b9%d9%84%d9%88%d9%85')).toBe(
      '%d8%b9%d9%84%d9%88%d9%85',
    );
  });

  it('does not match the catalog index, the player, or anything deeper', () => {
    expect(courseSlugFromPath('/courses')).toBeNull();
    expect(courseSlugFromPath('/courses/')).toBeNull();
    expect(courseSlugFromPath('/courses/python-basics/lessons')).toBeNull();
    expect(courseSlugFromPath('/courses/python-basics/lessons/abc-123')).toBeNull();
  });

  it('does not match another route that merely begins the same way', () => {
    expect(courseSlugFromPath('/coursesish/x')).toBeNull();
    expect(courseSlugFromPath('/library/python-basics')).toBeNull();
    expect(courseSlugFromPath('/')).toBeNull();
  });

  it('never fires on a route the redirect matrix already owns', () => {
    // The two rules share one branch in `proxy()`; this is what makes the
    // «they can never both fire» comment there true.
    const slugged = ['/courses/python-basics', '/courses/x'];
    for (const path of slugged) {
      expect(courseSlugFromPath(path)).not.toBeNull();
      expect(isProtectedRoute(path)).toBe(false);
    }
  });
});

describe('decideRedirect — the redirect matrix, every cell', () => {
  const anonymous: AuthState = { authenticated: false, onboardingCompleted: false };
  const incomplete: AuthState = { authenticated: true, onboardingCompleted: false };
  const complete: AuthState = { authenticated: true, onboardingCompleted: true };

  it('anonymous → /dashboard, /onboarding, /settings/* ⇒ login', () => {
    expect(decideRedirect('/dashboard', anonymous)).toBe('login');
    expect(decideRedirect('/onboarding', anonymous)).toBe('login');
    expect(decideRedirect('/settings', anonymous)).toBe('login');
    expect(decideRedirect('/settings/devices', anonymous)).toBe('login');
  });

  it('anonymous → the course player ⇒ login (Plan 4)', () => {
    expect(decideRedirect('/courses/python-basics/lessons/abc-123', anonymous)).toBe('login');
  });

  it('authenticated but onboarding incomplete → any protected route except /onboarding ⇒ onboarding', () => {
    expect(decideRedirect('/dashboard', incomplete)).toBe('onboarding');
    expect(decideRedirect('/settings', incomplete)).toBe('onboarding');
    expect(decideRedirect('/settings/devices', incomplete)).toBe('onboarding');
  });

  it('authenticated but onboarding incomplete → /onboarding itself ⇒ no redirect (lets them finish)', () => {
    expect(decideRedirect('/onboarding', incomplete)).toBeNull();
  });

  it('authenticated and onboarded → /onboarding ⇒ dashboard (never stranded in a finished flow)', () => {
    expect(decideRedirect('/onboarding', complete)).toBe('dashboard');
  });

  it('authenticated and onboarded → any other protected route ⇒ no redirect', () => {
    expect(decideRedirect('/dashboard', complete)).toBeNull();
    expect(decideRedirect('/settings', complete)).toBeNull();
    expect(decideRedirect('/settings/devices', complete)).toBeNull();
  });

  it('public routes stay public for everyone, unconditionally — anonymous', () => {
    expect(decideRedirect('/', anonymous)).toBeNull();
    expect(decideRedirect('/login', anonymous)).toBeNull();
    expect(decideRedirect('/courses', anonymous)).toBeNull();
  });

  it('public routes stay public for everyone, unconditionally — onboarding incomplete', () => {
    expect(decideRedirect('/', incomplete)).toBeNull();
    expect(decideRedirect('/courses', incomplete)).toBeNull();
  });

  it('public routes stay public for everyone, unconditionally — fully onboarded', () => {
    expect(decideRedirect('/', complete)).toBeNull();
    expect(decideRedirect('/courses', complete)).toBeNull();
  });

  /**
   * The catalog is public BY DESIGN and must stay that way for all three auth
   * states — gating it would take every course page out of search results, and
   * `sitemap.ts` would then be advertising URLs that redirect. What is gated is
   * the CONTENT: `/courses/:slug/lessons/:lessonId` (covered above) and the
   * video id, which the catalog API no longer publishes at all.
   */
  it('the public catalog is never gated — the CONTENT is', () => {
    for (const auth of [anonymous, incomplete, complete]) {
      expect(decideRedirect('/courses', auth)).toBeNull();
      expect(decideRedirect('/courses/python-basics', auth)).toBeNull();
    }
    // …while the player behind it is, for anyone without a session.
    expect(decideRedirect('/courses/python-basics/lessons/abc-123', anonymous)).toBe('login');
  });

  /**
   * `/login` and `/register` are the one place where being AUTHENTICATED is
   * what triggers a redirect. They are not in `PROTECTED_PREFIXES` — adding
   * them there would lock out the only people who need them — so this is its
   * own branch, and its own set of cells.
   */
  describe('the auth routes', () => {
    it('anonymous ⇒ no redirect: these are the pages they came for', () => {
      expect(decideRedirect('/login', anonymous)).toBeNull();
      expect(decideRedirect('/register', anonymous)).toBeNull();
    });

    it('authenticated and onboarded ⇒ next (never an empty form for someone already in)', () => {
      expect(decideRedirect('/login', complete)).toBe('next');
      expect(decideRedirect('/register', complete)).toBe('next');
    });

    it('authenticated but onboarding incomplete ⇒ onboarding, which outranks next', () => {
      expect(decideRedirect('/login', incomplete)).toBe('onboarding');
      expect(decideRedirect('/register', incomplete)).toBe('onboarding');
    });

    it('matches the two paths exactly — never a prefix', () => {
      // `/login-help` or a future `/register/verify` must not inherit this
      // behaviour by accident, the way a `startsWith` check would give it to
      // them.
      expect(decideRedirect('/login-help', complete)).toBeNull();
      expect(decideRedirect('/register/verify', complete)).toBeNull();
      expect(decideRedirect('/logout', complete)).toBeNull();
    });
  });
});

describe('applyBaseSecurityHeaders', () => {
  it('sets the unconditional headers in both dev and prod', () => {
    for (const dev of [true, false]) {
      const headers = new Headers();
      applyBaseSecurityHeaders(headers, dev);
      expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(headers.get('X-DNS-Prefetch-Control')).toBe('off');
      expect(headers.get('Reporting-Endpoints')).toBe('csp-endpoint="/api/security/csp-report"');

      // Asserted per-feature rather than as one exact string: the previous
      // exact-match assertion meant every ADDITION to the policy failed the
      // test, which is backwards — the thing worth locking down is that no
      // capability is silently RE-ENABLED.
      const permissions = headers.get('Permissions-Policy') ?? '';
      for (const feature of [
        'camera',
        'microphone',
        'geolocation',
        'payment',
        'usb',
        'serial',
        'bluetooth',
        'hid',
        'midi',
        'display-capture',
        'browsing-topics',
        'interest-cohort',
      ]) {
        expect(permissions).toContain(`${feature}=()`);
      }

      // Clickjacking. `frame-ancestors 'none'` says the same thing in the CSP,
      // but that policy is REPORT-ONLY until CSP_ENFORCE flips — so during the
      // soak this header is the only one actually preventing the frame.
      expect(headers.get('X-Frame-Options')).toBe('DENY');

      expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups');

      // ⚠️ `same-site`, never `same-origin`: media is on a different ORIGIN
      // (media.aymanaboelela.com) by architectural requirement, and
      // `same-origin` would block every cover image and attachment the app
      // renders. This assertion exists to make that regression loud.
      expect(headers.get('Cross-Origin-Resource-Policy')).toBe('same-site');
    }
  });

  /**
   * The inbox recorder's one dependency outside its own component. A denied
   * feature is not a prompt the admin can decline — `getUserMedia` rejects
   * before the browser asks — so «سجّل رسالة صوتية» was dead on every
   * deployed build while every local test that skipped the proxy passed.
   */
  it('grants the microphone to the admin panel, and to nothing else', () => {
    const admin = new Headers();
    applyBaseSecurityHeaders(admin, false, { microphone: true });
    expect(admin.get('Permissions-Policy')).toContain('microphone=(self)');

    const student = new Headers();
    applyBaseSecurityHeaders(student, false, { microphone: false });
    expect(student.get('Permissions-Policy')).toContain('microphone=()');

    // The default is the DENIAL: every call site that says nothing about a
    // microphone must keep getting one that is off.
    const bare = new Headers();
    applyBaseSecurityHeaders(bare, false);
    expect(bare.get('Permissions-Policy')).toContain('microphone=()');
  });

  it('routes: only /admin and its descendants get the grant', () => {
    expect(isAdminRoute('/admin')).toBe(true);
    expect(isAdminRoute('/admin/inbox/abc')).toBe(true);
    expect(isAdminRoute('/administration')).toBe(false);
    expect(isAdminRoute('/dashboard')).toBe(false);
  });

  it('omits HSTS in dev (meaningless, and a no-op, over plain http://localhost)', () => {
    const headers = new Headers();
    applyBaseSecurityHeaders(headers, true);
    expect(headers.get('Strict-Transport-Security')).toBeNull();
  });

  it('sets a 2-year preloadable HSTS header in production', () => {
    const headers = new Headers();
    applyBaseSecurityHeaders(headers, false);
    expect(headers.get('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );
  });
});

describe('CSP builders', () => {
  const NONCE = 'r4nd0mNONCEvalue';
  /**
   * The same default `proxy.ts` falls back to when `NEXT_PUBLIC_MEDIA_ORIGIN`
   * is unset, which is the case under vitest. Asserting against the default
   * rather than setting the env var keeps this a pure unit test — what matters
   * is that the media origin reaches the policy at all, not which one it is.
   */
  const MEDIA_ORIGIN_FOR_TEST = 'http://localhost:3300';

  it('hashes the exact bytes of the script app/layout.tsx renders', () => {
    const expected = `'sha256-${createHash('sha256').update(PREPAINT_SCRIPT, 'utf8').digest('base64')}'`;
    expect(PREPAINT_SCRIPT_HASH).toBe(expected);
  });

  it('keeps the public policy compatible with prerendering (unsafe-inline, no nonce/hash)', () => {
    const policy = buildPublicCsp(false);
    const scriptSrc = directive(policy, 'script-src');
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain('nonce-');
    // A hash next to 'unsafe-inline' would make browsers ignore
    // 'unsafe-inline' entirely and block Next's own inline bootstrap.
    expect(scriptSrc).not.toContain('sha256-');
  });

  /**
   * This test used to assert the opposite — nonce + `'strict-dynamic'`, and
   * NO `'unsafe-inline'`. That policy was switched to enforcing in production
   * and blocked every Next chunk and Next's own inline bootstrap, taking the
   * whole admin down: under `'strict-dynamic'` host allowlisting is off, so
   * only nonce-matched scripts run, and with `cacheComponents: true` the HTML
   * shell is served from cache and cannot carry a per-request nonce.
   *
   * Report-only mode hid it entirely. See `buildAuthenticatedCsp` for the full
   * account and for what has to change before a nonce can come back.
   */
  it('serves ONE policy on both public and authenticated routes', () => {
    expect(buildAuthenticatedCsp(NONCE, false)).toBe(buildPublicCsp(false));
  });

  it('ignores the nonce argument entirely — a cached shell can never match one', () => {
    expect(buildAuthenticatedCsp(NONCE, false)).not.toContain(NONCE);
    expect(buildAuthenticatedCsp('a', false)).toBe(buildAuthenticatedCsp('b', false));
  });

  it('carries no nonce and no strict-dynamic, so `unsafe-inline` is not silently voided', () => {
    // Per CSP2+, ANY nonce or hash in script-src makes browsers ignore
    // `'unsafe-inline'`. Re-adding either without removing `'unsafe-inline'`
    // would therefore not "harden" the policy — it would break every page.
    const scriptSrc = directive(buildAuthenticatedCsp(NONCE, false), 'script-src');
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain('nonce-');
    expect(scriptSrc).not.toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain(PREPAINT_SCRIPT_HASH);
  });

  it('allows the media origin in img-src and media-src', () => {
    // Uploaded assets — course covers, avatars, the admin's logo — render as
    // `<img src={mediaUrl(key)}>`, which builds
    // `${NEXT_PUBLIC_MEDIA_ORIGIN}/media/<key>`. That is a DIFFERENT ORIGIN by
    // architectural requirement, so `'self'` does not cover it and an enforced
    // policy would blank every image on the site. The catalogue was empty the
    // first time enforcement was switched on, which is the only reason this
    // did not surface as a wall of broken images.
    for (const policy of [buildPublicCsp(false), buildAuthenticatedCsp(NONCE, false)]) {
      expect(directive(policy, 'img-src')).toContain(MEDIA_ORIGIN_FOR_TEST);
      expect(directive(policy, 'media-src')).toContain(MEDIA_ORIGIN_FOR_TEST);
    }
  });

  it('names the external script hosts, since strict-dynamic no longer covers them', () => {
    const scriptSrc = directive(buildPublicCsp(false), 'script-src');
    // The YouTube IFrame API: `loadYouTubeIframeApi()` injects this tag, and
    // it used to ride on `'strict-dynamic'`. Without this host every lesson
    // video breaks the moment CSP is enforced.
    expect(scriptSrc).toContain('https://www.youtube.com');
    // Cloudflare injects its Web Analytics beacon at the edge.
    expect(scriptSrc).toContain('https://static.cloudflareinsights.com');
    // Microsoft Clarity's tag, injected by `@microsoft/clarity`.
    expect(scriptSrc).toContain('https://www.clarity.ms');
    // ⚠️ AND the host the tag then loads the RECORDER from. This assertion is
    // the one that was missing, and its absence is why the previous version of
    // this test passed against a policy that blocked Clarity in production:
    // `www.clarity.ms/tag/<id>` is only a loader, and it injects
    // `scripts.clarity.ms/<version>/clarity.js`. Stage one was allowed, stage
    // two was blocked, and nothing anywhere reported it — Clarity's dashboard
    // just showed no sessions.
    //
    // `toContain('https://www.clarity.ms')` above CANNOT catch this on its own:
    // it is a substring check, and it would still pass on a policy that named
    // only the tag host. Hence a separate assertion on the separate host.
    expect(scriptSrc).toContain('https://scripts.clarity.ms');
  });

  /**
   * The third Clarity host, and the third directive. `c.clarity.ms/c.gif` is a
   * tracking pixel fetched as an <img>, so neither `script-src` (the two tag
   * hosts) nor `connect-src` (the upload collector) covers it. Measured blocked
   * in production on 2026-08-15.
   */
  it('allows BOTH of Clarity’s tracking pixels in img-src', () => {
    for (const policy of [buildPublicCsp(false), buildAuthenticatedCsp(NONCE, false)]) {
      const imgSrc = directive(policy, 'img-src');
      expect(imgSrc).toContain('https://c.clarity.ms');
      // `c.bing.com` is ALSO in `connect-src`, where it does nothing: it is an
      // <img>, not a `fetch`. Asserting it here specifically — a test that only
      // checked connect-src passed while the browser blocked it.
      expect(imgSrc).toContain('https://c.bing.com');
    }
  });

  /**
   * The half that is easy to lose, and was: Clarity's tag comes from
   * `www.clarity.ms` but it UPLOADS to a regional collector (`*.clarity.ms`)
   * and to `c.bing.com`. Naming only the script host produces a tag that
   * loads, runs, records — and delivers nothing, while the dashboard says «no
   * data» and gives no hint that the cause is a header.
   *
   * Both halves are asserted separately so removing either one fails loudly.
   */
  it('lets Clarity upload what it records, not just load its tag', () => {
    const connectSrc = directive(buildPublicCsp(false), 'connect-src');
    expect(connectSrc).toContain('https://*.clarity.ms');
    expect(connectSrc).toContain('https://c.bing.com');
  });

  it('locks down the shared directives identically on both policies', () => {
    for (const policy of [buildPublicCsp(false), buildAuthenticatedCsp(NONCE, false)]) {
      expect(directive(policy, 'object-src')).toBe("object-src 'none'");
      expect(directive(policy, 'base-uri')).toBe("base-uri 'self'");
      expect(directive(policy, 'form-action')).toBe("form-action 'self'");
      expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
      // 'self' is the document viewer (Plan 8). It is framed from our own
      // origin because the media origin is @Public() and cannot carry
      // enrollment-gated content; each such response ships its own
      // `default-src 'none'; sandbox`, so this does not widen what a framed
      // document may DO.
      // The Google pair is the Drive/Docs `/preview` viewer for a link
      // material. Asserted VERBATIM on purpose: `frame-src` is enforced, so a
      // host missing here renders as a blank box with a console error and no
      // visible explanation — the failure that looks like a working feature.
      expect(directive(policy, 'frame-src')).toBe(
        "frame-src 'self' https://www.youtube-nocookie.com https://drive.google.com https://docs.google.com",
      );
      // `toContain`, not `toBe`: the media origin is appended from an env var
      // and is asserted on its own above. Pinning the whole string here would
      // make this test fail for the wrong reason whenever that origin changes.
      expect(directive(policy, 'img-src')).toContain("img-src 'self' blob: data: https://i.ytimg.com");
      expect(policy).toContain('report-uri /api/security/csp-report');
      expect(policy).toContain('report-to csp-endpoint');
      // NOT `upgrade-insecure-requests`. It is omitted while the policy ships
      // report-only, because the browser ignores it there and says so in every
      // visitor's console on every navigation. See `buildPublicCsp`.
      expect(policy).not.toContain('upgrade-insecure-requests');
    }
  });

  it('widens frame-src without ever letting anyone frame US', () => {
    // These two are easy to conflate. frame-src says what WE may embed;
    // frame-ancestors says who may embed us. Plan 8 relaxed the first only.
    for (const policy of [buildPublicCsp(false), buildAuthenticatedCsp(NONCE, false)]) {
      expect(directive(policy, 'frame-src')).toContain("'self'");
      expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
      // A PDF viewer must never be the reason object-src gets loosened.
      expect(directive(policy, 'object-src')).toBe("object-src 'none'");
    }
  });

  it('never leaks dev-only relaxations into a production build', () => {
    for (const policy of [buildPublicCsp(false), buildAuthenticatedCsp(NONCE, false)]) {
      expect(policy).not.toContain("'unsafe-eval'");
      expect(policy).not.toContain('ws:');
    }
    const dev = buildPublicCsp(true);
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(dev, 'connect-src')).toContain('ws:');
    // Absent in dev for its own reason — it would rewrite http://localhost to
    // https — as well as for the report-only reason that keeps it out of the
    // production policy today.
    expect(dev).not.toContain('upgrade-insecure-requests');
  });
});

describe('isDevOnlyRoute', () => {
  it('matches the design-system playground and its children', () => {
    for (const path of ['/dev', '/dev/tokens', '/dev/motion', '/dev/showpiece', '/dev/taxonomy']) {
      expect(isDevOnlyRoute(path)).toBe(true);
    }
  });

  it('does not match a public route that merely starts with the same letters', () => {
    // `/devices` is a real settings route. A bare `startsWith('/dev')` would
    // 404 it in production, which is exactly the bug this test exists to stop.
    for (const path of ['/devices', '/settings/devices', '/courses/dev-basics', '/']) {
      expect(isDevOnlyRoute(path)).toBe(false);
    }
  });
});

describe('resolveMarkdownRewrite', () => {
  const BROWSER_ACCEPT =
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';

  it('rewrites when an agent asks for markdown by Accept', () => {
    expect(resolveMarkdownRewrite('/', 'text/markdown')).toBe('/md');
    expect(resolveMarkdownRewrite('/courses', 'text/markdown')).toBe('/md/courses');
    expect(resolveMarkdownRewrite('/courses/python-basics', 'text/markdown')).toBe(
      '/md/courses/python-basics',
    );
  });

  it('rewrites a .md URL without needing any Accept header', () => {
    expect(resolveMarkdownRewrite('/index.md', null)).toBe('/md');
    expect(resolveMarkdownRewrite('/courses.md', null)).toBe('/md/courses');
    expect(resolveMarkdownRewrite('/courses/python-basics.md', BROWSER_ACCEPT)).toBe(
      '/md/courses/python-basics',
    );
  });

  /** The whole point of the q-value parsing — a student must never get plain text. */
  it('leaves a real browser request alone', () => {
    expect(resolveMarkdownRewrite('/', BROWSER_ACCEPT)).toBeNull();
    expect(resolveMarkdownRewrite('/courses', BROWSER_ACCEPT)).toBeNull();
    expect(resolveMarkdownRewrite('/', null)).toBeNull();
  });

  /**
   * A `.md` suffix must not become a way around the redirect matrix. Every one
   * of these has no markdown twin, so it falls through to a normal 404 rather
   * than to a renderer.
   */
  it('is null for protected and unknown routes, with or without .md', () => {
    for (const path of [
      '/dashboard',
      '/dashboard.md',
      '/admin/settings.md',
      '/courses/python-basics/lessons/abc',
      '/courses/python-basics/lessons/abc.md',
      '/login.md',
      '/nope.md',
    ]) {
      expect(resolveMarkdownRewrite(path, 'text/markdown')).toBeNull();
    }
  });
});
