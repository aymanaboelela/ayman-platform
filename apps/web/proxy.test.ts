import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { THEME_SCRIPT } from './lib/security/theme-script';
import {
  THEME_SCRIPT_HASH,
  applyBaseSecurityHeaders,
  buildAuthenticatedCsp,
  buildPublicCsp,
  decideRedirect,
  isProtectedRoute,
  type AuthState,
} from './proxy';

const directive = (policy: string, name: string): string =>
  policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `) || part === name) ?? '';

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

  it('matches Plan 4’s course player, /courses/:slug/lessons/:lessonId, despite the dynamic slug', () => {
    expect(isProtectedRoute('/courses/python-basics/lessons')).toBe(true);
    expect(isProtectedRoute('/courses/python-basics/lessons/abc-123')).toBe(true);
    expect(isProtectedRoute('/courses/some-other-slug/lessons/xyz')).toBe(true);
    // A course whose slug happens to CONTAIN "lessons" must not false-match.
    expect(isProtectedRoute('/courses/lessons-101')).toBe(false);
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
});

describe('applyBaseSecurityHeaders', () => {
  it('sets the unconditional headers in both dev and prod', () => {
    for (const dev of [true, false]) {
      const headers = new Headers();
      applyBaseSecurityHeaders(headers, dev);
      expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(headers.get('Permissions-Policy')).toBe(
        'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      );
      expect(headers.get('X-DNS-Prefetch-Control')).toBe('off');
      expect(headers.get('Reporting-Endpoints')).toBe('csp-endpoint="/api/security/csp-report"');
    }
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

  it('hashes the exact bytes of the script app/layout.tsx renders', () => {
    const expected = `'sha256-${createHash('sha256').update(THEME_SCRIPT, 'utf8').digest('base64')}'`;
    expect(THEME_SCRIPT_HASH).toBe(expected);
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

  it('makes the authenticated policy strict and nonce-driven', () => {
    const policy = buildAuthenticatedCsp(NONCE, false);
    const scriptSrc = directive(policy, 'script-src');
    expect(scriptSrc).toContain(`'nonce-${NONCE}'`);
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).toContain(THEME_SCRIPT_HASH);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it('locks down the shared directives identically on both policies', () => {
    for (const policy of [buildPublicCsp(false), buildAuthenticatedCsp(NONCE, false)]) {
      expect(directive(policy, 'object-src')).toBe("object-src 'none'");
      expect(directive(policy, 'base-uri')).toBe("base-uri 'self'");
      expect(directive(policy, 'form-action')).toBe("form-action 'self'");
      expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
      expect(directive(policy, 'frame-src')).toBe('frame-src https://www.youtube-nocookie.com');
      expect(directive(policy, 'img-src')).toBe("img-src 'self' blob: data: https://i.ytimg.com");
      expect(policy).toContain('report-uri /api/security/csp-report');
      expect(policy).toContain('report-to csp-endpoint');
      expect(policy).toContain('upgrade-insecure-requests');
    }
  });

  it('never leaks dev-only relaxations into a production build', () => {
    for (const policy of [buildPublicCsp(false), buildAuthenticatedCsp(NONCE, false)]) {
      expect(policy).not.toContain("'unsafe-eval'");
      expect(policy).not.toContain('ws:');
      expect(policy).toContain('upgrade-insecure-requests');
    }
    const dev = buildPublicCsp(true);
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(dev, 'connect-src')).toContain('ws:');
    expect(dev).not.toContain('upgrade-insecure-requests');
  });
});
