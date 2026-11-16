import { describe, expect, it, vi } from 'vitest';
import {
  GUIDE_DELAY_MS,
  checkoutSlugOf,
  createVisibleBudget,
  helperPlaceOf,
  isAutomated,
  isBusy,
  isDialogPath,
  mayResume,
  probeViewer,
  readStored,
  shouldCountDown,
  writeStored,
} from './guide-gate';

/**
 * The rules that decide whether the guide may appear at all. Every one of
 * them runs on every page of three route groups, before anything of the guide
 * has loaded — so they are the part that must be right for the students the
 * guide is NOT for.
 */

describe('where the dialog may be on screen', () => {
  it.each([
    ['/', true],
    ['/courses', true],
    ['/courses/python-y2', true],
    ['/years/2', true],
    ['/about', true],
    ['/essentials/terms', true],
    // The checkout, as a page and as the generic route.
    ['/courses/python-y2/subscribe', false],
    ['/subscribe', false],
    // Its own order dialog and address form.
    ['/books', false],
    // A self-test in progress is still a test.
    ['/practice/2/some-lesson', false],
    ['/terms', false],
    ['/privacy', false],
    ['/pdfs/sheet', false],
    // A lesson is a lesson whichever group serves it.
    ['/courses/python-y2/lessons/abc', false],
    // Segment boundaries, not string prefixes.
    ['/courses-old', false],
    ['/aboutus', false],
  ])('site %s → %s', (pathname, expected) => {
    expect(isDialogPath('site', pathname)).toBe(expected);
  });

  it.each([
    ['/dashboard', true],
    ['/library', true],
    // A course somebody already holds.
    ['/library/python-y2', false],
    ['/courses/python-y2/lessons/abc', false],
    ['/quizzes/l1/attempt/a1', false],
    ['/quizzes/l1', false],
    ['/onboarding', false],
    ['/welcome', false],
    ['/settings/section', false],
    ['/wallet', false],
  ])('app %s → %s', (pathname, expected) => {
    expect(isDialogPath('app', pathname)).toBe(expected);
  });

  it('is never an auth page', () => {
    for (const pathname of ['/login', '/register', '/forgot-password', '/']) {
      expect(isDialogPath('auth', pathname)).toBe(false);
    }
  });
});

describe('where the helper circle stands', () => {
  it('beside the register, sign-in and onboarding forms', () => {
    expect(helperPlaceOf('/register', null)).toBe('register');
    expect(helperPlaceOf('/login', null)).toBe('login');
    expect(helperPlaceOf('/onboarding', null)).toBe('onboarding');
  });

  it('beside the checkout of the course the guide chose, and no other', () => {
    expect(helperPlaceOf('/courses/python-y2/subscribe', 'python-y2')).toBe('checkout');
    expect(helperPlaceOf('/courses/other/subscribe', 'python-y2')).toBeNull();
    expect(helperPlaceOf('/courses/python-y2/subscribe', null)).toBeNull();
    // The course page itself is not the checkout.
    expect(helperPlaceOf('/courses/python-y2', 'python-y2')).toBeNull();
  });

  it('matches an Arabic slug through its percent-encoding', () => {
    const slug = 'بايثون';
    expect(checkoutSlugOf(`/courses/${encodeURIComponent(slug)}/subscribe`)).toBe(slug);
    expect(helperPlaceOf(`/courses/${encodeURIComponent(slug)}/subscribe`, slug)).toBe('checkout');
  });

  it('nowhere on a lesson, a quiz attempt or the welcome scene', () => {
    for (const pathname of ['/courses/x/lessons/1', '/quizzes/l/attempt/a', '/welcome', '/dashboard']) {
      expect(helperPlaceOf(pathname, 'x')).toBeNull();
    }
  });
});

describe('resuming a guide in progress', () => {
  it('loads on the pages that have something of it to draw', () => {
    expect(mayResume('site', '/')).toBe(true);
    expect(mayResume('auth', '/register')).toBe(true);
    expect(mayResume('app', '/onboarding')).toBe(true);
    expect(mayResume('site', '/courses/any/subscribe')).toBe(true);
  });

  it('does not load on a lesson or a quiz attempt', () => {
    expect(mayResume('app', '/courses/x/lessons/1')).toBe(false);
    expect(mayResume('app', '/quizzes/l/attempt/a')).toBe(false);
    expect(mayResume('site', '/books')).toBe(false);
  });
});

describe('the automatic appearance', () => {
  const base = { surface: 'site' as const, pathname: '/', seen: false, inProgress: false, automated: false };

  it('counts down for a first-time visitor on an eligible page', () => {
    expect(shouldCountDown(base)).toBe(true);
  });

  it('never under automation — this is what keeps it out of every e2e spec', () => {
    expect(isAutomated({ webdriver: true })).toBe(true);
    expect(isAutomated({ webdriver: false })).toBe(false);
    expect(isAutomated({})).toBe(false);
    expect(isAutomated(undefined)).toBe(false);
    expect(shouldCountDown({ ...base, automated: true })).toBe(false);
  });

  it('never twice on one device', () => {
    expect(shouldCountDown({ ...base, seen: true })).toBe(false);
  });

  it('never beside a guide already in progress, and never off an eligible page', () => {
    expect(shouldCountDown({ ...base, inProgress: true })).toBe(false);
    expect(shouldCountDown({ ...base, pathname: '/books' })).toBe(false);
    expect(shouldCountDown({ ...base, surface: 'auth', pathname: '/register' })).toBe(false);
    expect(shouldCountDown({ ...base, surface: 'app', pathname: '/courses/x/lessons/1' })).toBe(false);
  });
});

/** A clock and a timer moved by hand. */
function harness(spentMs = 0) {
  let now = 1_000;
  let pending: { run: () => void; at: number } | null = null;
  const onDone = vi.fn();
  const onSpend = vi.fn();
  const budget = createVisibleBudget({
    budgetMs: GUIDE_DELAY_MS,
    spentMs,
    now: () => now,
    setTimer: (run, ms) => {
      pending = { run, at: now + ms };
      return pending;
    },
    clearTimer: (handle) => {
      if (pending === handle) pending = null;
    },
    onSpend,
    onDone,
  });
  return {
    budget,
    onDone,
    onSpend,
    advance(ms: number) {
      now += ms;
      if (pending && pending.at <= now) {
        const { run } = pending;
        pending = null;
        run();
      }
    },
    hasTimer: () => pending !== null,
  };
}

describe('thirty VISIBLE seconds', () => {
  it('fires after thirty seconds of the page being looked at', () => {
    const h = harness();
    h.budget.resume();
    h.advance(29_999);
    expect(h.onDone).not.toHaveBeenCalled();
    h.advance(1);
    expect(h.onDone).toHaveBeenCalledTimes(1);
  });

  it('does not count a hidden tab, and holds no timer while hidden', () => {
    const h = harness();
    h.budget.resume();
    h.advance(10_000);
    h.budget.pause();
    expect(h.hasTimer()).toBe(false);
    // Ten minutes in another tab.
    h.advance(600_000);
    expect(h.onDone).not.toHaveBeenCalled();
    expect(h.budget.spent()).toBe(10_000);

    h.budget.resume();
    h.advance(19_999);
    expect(h.onDone).not.toHaveBeenCalled();
    h.advance(1);
    expect(h.onDone).toHaveBeenCalledTimes(1);
  });

  it('reports the running total on every pause, so it survives a navigation', () => {
    const h = harness();
    h.budget.resume();
    h.advance(12_000);
    h.budget.pause();
    expect(h.onSpend).toHaveBeenLastCalledWith(12_000);
  });

  it('carries on from what earlier pages of the session already spent', () => {
    const h = harness(25_000);
    h.budget.resume();
    h.advance(4_999);
    expect(h.onDone).not.toHaveBeenCalled();
    h.advance(1);
    expect(h.onDone).toHaveBeenCalledTimes(1);
  });

  it('treats a nonsense stored total as a number inside the budget', () => {
    expect(harness(-50).budget.spent()).toBe(0);
    expect(harness(10 ** 9).budget.spent()).toBe(GUIDE_DELAY_MS);
  });

  it('is idempotent about resume and pause', () => {
    const h = harness();
    h.budget.resume();
    h.budget.resume();
    h.advance(5_000);
    h.budget.pause();
    h.budget.pause();
    expect(h.budget.spent()).toBe(5_000);
  });

  it('asks again a little later when the moment was wrong', () => {
    const h = harness();
    h.budget.resume();
    h.advance(30_000);
    expect(h.onDone).toHaveBeenCalledTimes(1);
    h.budget.rewind(5_000);
    h.advance(4_999);
    expect(h.onDone).toHaveBeenCalledTimes(1);
    h.advance(1);
    expect(h.onDone).toHaveBeenCalledTimes(2);
  });
});

describe('not interrupting', () => {
  it('waits while a dialog is open or a field is being typed in', () => {
    document.body.innerHTML = '<div role="dialog"></div>';
    expect(isBusy(document)).toBe(true);

    document.body.innerHTML = '<input id="q" />';
    document.getElementById('q')!.focus();
    expect(isBusy(document)).toBe(true);

    document.body.innerHTML = '<button id="b">x</button>';
    document.getElementById('b')!.focus();
    expect(isBusy(document)).toBe(false);
    document.body.innerHTML = '';
  });
});

const answer = (status: number, body: unknown = null) => ({
  status,
  ok: status >= 200 && status < 300,
  json: () => Promise.resolve(body),
});

/** A fetcher that answers by path and records what was asked. */
function api(routes: Record<string, ReturnType<typeof answer> | Error>) {
  const asked: string[] = [];
  const fetcher = (path: string) => {
    asked.push(path);
    const hit = routes[path];
    if (hit === undefined) return Promise.reject(new Error(`unexpected ${path}`));
    return hit instanceof Error ? Promise.reject(hit) : Promise.resolve(hit);
  };
  return { fetcher, asked };
}

describe('who is a NEW client', () => {
  it('a visitor with no session, on a public page', async () => {
    const { fetcher, asked } = api({ '/api/session': answer(401), '/api/guardian/me': answer(401) });
    expect(await probeViewer('site', fetcher)).toEqual({ viewer: 'visitor', settled: false });
    // Nothing about enrollments for somebody with no account.
    expect(asked).toEqual(['/api/session', '/api/guardian/me']);
  });

  it('never a guardian — signed in by code, with no student session', async () => {
    const { fetcher } = api({
      '/api/session': answer(401),
      '/api/guardian/me': answer(200, { student: { fullName: 'x' } }),
    });
    expect(await probeViewer('site', fetcher)).toEqual({ viewer: null, settled: true });
  });

  it('does not call somebody a visitor when the guardian check could not answer', async () => {
    const throttled = api({ '/api/session': answer(401), '/api/guardian/me': answer(429) });
    expect(await probeViewer('site', throttled.fetcher)).toEqual({ viewer: null, settled: false });
    const down = api({ '/api/session': answer(401), '/api/guardian/me': new Error('offline') });
    expect(await probeViewer('site', down.fetcher)).toEqual({ viewer: null, settled: false });
  });

  it('a student with no enrollment and no payment claim, at home', async () => {
    const { fetcher } = api({
      '/api/session': answer(200, { role: 'student' }),
      '/api/enrollments': answer(200, []),
      '/api/payments/submissions/me': answer(200, []),
    });
    expect(await probeViewer('app', fetcher)).toEqual({ viewer: 'new-student', settled: false });
  });

  it('never an enrolled student — and the device stops asking', async () => {
    const { fetcher } = api({
      '/api/session': answer(200, { role: 'student' }),
      '/api/enrollments': answer(200, [{ courseId: 'c' }]),
      '/api/payments/submissions/me': answer(200, []),
    });
    expect(await probeViewer('app', fetcher)).toEqual({ viewer: null, settled: true });
  });

  it('never a student whose payment is waiting for review', async () => {
    const { fetcher } = api({
      '/api/session': answer(200, { role: 'student' }),
      '/api/enrollments': answer(200, []),
      '/api/payments/submissions/me': answer(200, [{ status: 'pending' }]),
    });
    expect(await probeViewer('app', fetcher)).toEqual({ viewer: null, settled: true });
  });

  it.each(['owner', 'admin', 'guardian', 'center_manager', 'video_editor', undefined])(
    'never staff or any other role (%s), on either surface',
    async (role) => {
      for (const surface of ['site', 'app'] as const) {
        const { fetcher, asked } = api({ '/api/session': answer(200, { role }) });
        expect(await probeViewer(surface, fetcher)).toEqual({ viewer: null, settled: true });
        expect(asked).toEqual(['/api/session']);
      }
    },
  );

  it('does not greet a signed-in student on the marketing pages', async () => {
    const { fetcher, asked } = api({ '/api/session': answer(200, { role: 'student' }) });
    // Not settled: the same student may still be new, at home.
    expect(await probeViewer('site', fetcher)).toEqual({ viewer: null, settled: false });
    expect(asked).toEqual(['/api/session']);
  });

  it('treats «no session» on a signed-in surface as not now', async () => {
    const { fetcher, asked } = api({ '/api/session': answer(401) });
    expect(await probeViewer('app', fetcher)).toEqual({ viewer: null, settled: false });
    expect(asked).toEqual(['/api/session']);
  });

  it('fails closed, without settling, on any error', async () => {
    const down = api({ '/api/session': new Error('offline') });
    expect(await probeViewer('site', down.fetcher)).toEqual({ viewer: null, settled: false });

    const fiveHundred = api({ '/api/session': answer(500) });
    expect(await probeViewer('site', fiveHundred.fetcher)).toEqual({ viewer: null, settled: false });

    const throttled = api({
      '/api/session': answer(200, { role: 'student' }),
      '/api/enrollments': answer(429),
      '/api/payments/submissions/me': answer(200, []),
    });
    expect(await probeViewer('app', throttled.fetcher)).toEqual({ viewer: null, settled: false });

    const wrongShape = api({
      '/api/session': answer(200, { role: 'student' }),
      '/api/enrollments': answer(200, { rows: [] }),
      '/api/payments/submissions/me': answer(200, []),
    });
    expect(await probeViewer('app', wrongShape.fetcher)).toEqual({ viewer: null, settled: false });
  });
});

describe('storage that may not be there', () => {
  const throwing = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('quota');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  } as unknown as Storage;

  it('reads as empty and reports a failed write, never throwing', () => {
    expect(readStored(undefined, 'k')).toBeNull();
    expect(readStored(throwing, 'k')).toBeNull();
    expect(writeStored(undefined, 'k', '1')).toBe(false);
    expect(writeStored(throwing, 'k', '1')).toBe(false);
    expect(writeStored(throwing, 'k', null)).toBe(false);
  });

  it('writes, reads back and removes', () => {
    expect(writeStored(window.sessionStorage, 'guide-test', '1')).toBe(true);
    expect(readStored(window.sessionStorage, 'guide-test')).toBe('1');
    expect(writeStored(window.sessionStorage, 'guide-test', null)).toBe(true);
    expect(readStored(window.sessionStorage, 'guide-test')).toBeNull();
  });
});
