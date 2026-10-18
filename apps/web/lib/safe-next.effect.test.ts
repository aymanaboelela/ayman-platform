import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxy } from '../proxy';
import { resolvePostLoginDestination } from './onboarding-redirect';
import { safeNext, withNext } from './safe-next';

/**
 * The open-redirect test, asserted on WHERE THE VISITOR LANDS rather than on
 * what `safeNext` returns.
 *
 * `safe-next.test.ts` checks the function's output against a table, and that
 * table passed while `/login?next=/.//evil.com` sent a signed-in student to
 * evil.com: the parser resolves the dot segment, the origin it reports is
 * still the base, and the normalised pathname that comes out is `//evil.com` —
 * a protocol-relative URL. Every check looked at the input; nothing looked at
 * what the browser would do with the output.
 *
 * So these resolve each result the way the consumers do — `location.assign`
 * in the login form, `redirect()` on `/welcome`, `new URL(target, request.url)`
 * in the proxy — and fail on any landing that is not this site.
 */

const ORIGIN = 'https://aymanaboelela.com';

/** Each one normalises to a path whose first segment is empty. */
const DOT_SEGMENT_PAYLOADS = [
  '/.//evil.com',
  '/.//evil.com/login',
  '/..//evil.com',
  '/a/..//evil.com',
  '/courses/x/../..//evil.com',
  '/%2e//evil.com',
  '/%2e%2e//evil.com',
  '/%2E//evil.com',
  '/./\\evil.com',
  '/.\\/evil.com',
  '/a/../\\/evil.com',
  '/.///evil.com',
];

/** What `safeNext` has always had to refuse, kept here so the effect is asserted for them too. */
const CLASSIC_PAYLOADS = ['//evil.com', '/\\evil.com', '/\\/evil.com', 'https://evil.com', '/\t/evil.com'];

const lands = (target: string): string => new URL(target, `${ORIGIN}/login?next=x`).origin;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a ?next= value can never take the visitor off the site', () => {
  it.each([...DOT_SEGMENT_PAYLOADS, ...CLASSIC_PAYLOADS])('safeNext(%j)', (payload) => {
    const out = safeNext(payload);
    if (out !== null) expect(lands(out)).toBe(ORIGIN);
  });

  it.each(DOT_SEGMENT_PAYLOADS)('is refused outright, not rewritten: %j', (payload) => {
    expect(safeNext(payload)).toBeNull();
  });

  it.each(DOT_SEGMENT_PAYLOADS)('withNext drops it rather than carrying it on: %j', (payload) => {
    expect(withNext('/onboarding', payload)).toBe('/onboarding');
  });

  it('still keeps a real destination that merely contains a dot segment', () => {
    expect(safeNext('/courses/x/../y')).toBe('/courses/y');
    expect(safeNext('/./dashboard')).toBe('/dashboard');
  });
});

describe('the login form lands on the site after the password is typed', () => {
  it.each(DOT_SEGMENT_PAYLOADS)('%j', async (payload) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ userId: 'u1', onboardingCompleted: true, profile: null }), {
          status: 200,
        }),
      ),
    );
    const destination = await resolvePostLoginDestination(payload);
    expect(lands(destination)).toBe(ORIGIN);
  });
});

describe('the proxy does not 307 a signed-in visitor off the site', () => {
  it.each(DOT_SEGMENT_PAYLOADS)('/login?next=%j', async (payload) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'u1', onboardingCompleted: true }), { status: 200 })),
    );

    const url = new URL('http://localhost/login');
    url.searchParams.set('next', payload);
    const response = await proxy(
      new NextRequest(url, { headers: { cookie: 'session_token=signed-in' } }),
    );

    const location = response.headers.get('location');
    expect(location).not.toBeNull();
    expect(new URL(location!, url).origin).toBe('http://localhost');
  });
});
