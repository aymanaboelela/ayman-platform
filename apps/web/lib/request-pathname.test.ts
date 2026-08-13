import { describe, expect, it } from 'vitest';
import { PATHNAME_HEADER, pathnameFromHeaders, stampPathname } from './request-pathname';

describe('stampPathname', () => {
  it('carries every other header through untouched', () => {
    /*
     * The load-bearing assertion in this file, and the reason the helper exists
     * at all rather than being an inline `new Headers({...})` in `proxy.ts`.
     *
     * Next treats the headers middleware hands back as the WHOLE request and
     * deletes any it was not given. Dropping `cookie` here would 401 every
     * authenticated read on every signed-in page, with the proxy still looking
     * perfectly correct.
     */
    const incoming = new Headers({
      cookie: 'session=abc; __Host-csrf=xyz',
      accept: 'text/html',
      'user-agent': 'Chrome',
    });

    const forwarded = stampPathname(incoming, '/dashboard');

    expect(forwarded.get('cookie')).toBe('session=abc; __Host-csrf=xyz');
    expect(forwarded.get('accept')).toBe('text/html');
    expect(forwarded.get('user-agent')).toBe('Chrome');
    expect(forwarded.get(PATHNAME_HEADER)).toBe('/dashboard');
  });

  it('does not mutate the incoming headers', () => {
    const incoming = new Headers({ accept: 'text/html' });
    stampPathname(incoming, '/dashboard');
    expect(incoming.get(PATHNAME_HEADER)).toBeNull();
  });

  it('overwrites an inbound value instead of appending to it', () => {
    // A request that sends its own `x-pathname` must not get to choose which
    // route the server tree believes it is rendering. `append` would leave
    // "/quizzes/l/attempt/a, /dashboard" — a string that matches neither
    // predicate and is a bug waiting for whoever splits it.
    const incoming = new Headers({ [PATHNAME_HEADER]: '/quizzes/lesson-1/attempt/attempt-1' });

    expect(stampPathname(incoming, '/dashboard').get(PATHNAME_HEADER)).toBe('/dashboard');
  });
});

describe('pathnameFromHeaders', () => {
  it('reads what the proxy stamped', () => {
    expect(pathnameFromHeaders(stampPathname(new Headers(), '/path'))).toBe('/path');
  });

  it('is null when the proxy did not run — a prefetch, or a public route', () => {
    expect(pathnameFromHeaders(new Headers())).toBeNull();
  });

  it('is null rather than an empty string', () => {
    // `''` is falsy but not null, and `isAttemptRoute('')` is a fine answer to
    // a question nobody asked. One shape of "absent" keeps every caller's
    // null-check honest.
    expect(pathnameFromHeaders(new Headers({ [PATHNAME_HEADER]: '' }))).toBeNull();
  });
});
