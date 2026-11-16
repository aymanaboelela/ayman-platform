import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GUIDE_DELAY_MS, GUIDE_SEEN_KEY, GUIDE_SPENT_KEY, GUIDE_STATE_KEY, INITIAL_GUIDE_STATE } from './guide-gate';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

// The lazily loaded guide, replaced by a marker: these cases are about WHEN
// the launcher asks for it, not about what it draws.
const rootLoaded = vi.fn();
vi.mock('./guide-root', () => {
  rootLoaded();
  return { GuideRoot: () => <div data-testid="guide-root" /> };
});

const { GuideLauncher } = await import('./guide-launcher');

const fetchMock = vi.fn();

function respond(routes: Record<string, { status: number; body?: unknown }>) {
  fetchMock.mockImplementation((path: string) => {
    const hit = routes[path];
    if (!hit) return Promise.reject(new Error(`unexpected ${path}`));
    return Promise.resolve({
      status: hit.status,
      ok: hit.status >= 200 && hit.status < 300,
      json: () => Promise.resolve(hit.body ?? null),
    });
  });
}

/** What the API answers somebody with no account of any kind. */
const VISITOR = { '/api/session': { status: 401 }, '/api/guardian/me': { status: 401 } };

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

function setWebdriver(value: boolean) {
  Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => value });
}

/** Lets the probe's promises and the dynamic import settle under fake timers. */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  pathname = '/';
  window.sessionStorage.clear();
  window.localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setWebdriver(false);
  setVisibility('visible');
  document.body.innerHTML = '';
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const shown = () => screen.queryByTestId('guide-root') !== null;

describe('the launcher', () => {
  it('renders nothing and asks the API nothing before the thirty seconds are up', async () => {
    respond(VISITOR);
    const { container } = render(<GuideLauncher surface="site" face={null} />);
    await advance(GUIDE_DELAY_MS - 1);
    expect(container.innerHTML).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shown()).toBe(false);
  });

  it('opens for a visitor after thirty visible seconds, and marks the device', async () => {
    respond(VISITOR);
    render(<GuideLauncher surface="site" face={null} />);
    await advance(GUIDE_DELAY_MS);
    await settle();

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['/api/session', '/api/guardian/me']);
    expect(shown()).toBe(true);
    // «First time only» is decided when it appears.
    expect(window.localStorage.getItem(GUIDE_SEEN_KEY)).toBe('1');
    expect(JSON.parse(window.sessionStorage.getItem(GUIDE_STATE_KEY)!)).toEqual(INITIAL_GUIDE_STATE);
  });

  it('never opens a second time on a device that has seen it', async () => {
    window.localStorage.setItem(GUIDE_SEEN_KEY, '1');
    respond(VISITOR);
    render(<GuideLauncher surface="site" face={null} />);
    await advance(GUIDE_DELAY_MS * 10);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shown()).toBe(false);
  });

  it('never opens under automation — the reason no e2e spec ever sees it', async () => {
    setWebdriver(true);
    respond(VISITOR);
    render(<GuideLauncher surface="site" face={null} />);
    await advance(GUIDE_DELAY_MS * 10);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shown()).toBe(false);
    expect(window.localStorage.getItem(GUIDE_SEEN_KEY)).toBeNull();
  });

  it('does not count a hidden tab', async () => {
    respond(VISITOR);
    render(<GuideLauncher surface="site" face={null} />);
    await advance(10_000);
    act(() => setVisibility('hidden'));
    await advance(600_000);
    expect(shown()).toBe(false);
    expect(window.sessionStorage.getItem(GUIDE_SPENT_KEY)).toBe('10000');

    act(() => setVisibility('visible'));
    await advance(19_999);
    expect(shown()).toBe(false);
    await advance(1);
    await settle();
    expect(shown()).toBe(true);
  });

  it('adds the time up across pages of the session', async () => {
    respond(VISITOR);
    const view = render(<GuideLauncher surface="site" face={null} />);
    await advance(20_000);

    // A soft navigation to another eligible page.
    pathname = '/courses';
    view.rerender(<GuideLauncher surface="site" face={null} />);
    await advance(9_999);
    expect(shown()).toBe(false);
    await advance(1);
    await settle();
    expect(shown()).toBe(true);
  });

  it('banks the time but does not count on a page it may not show on', async () => {
    respond(VISITOR);
    const view = render(<GuideLauncher surface="site" face={null} />);
    await advance(20_000);

    pathname = '/books';
    view.rerender(<GuideLauncher surface="site" face={null} />);
    expect(window.sessionStorage.getItem(GUIDE_SPENT_KEY)).toBe('20000');
    await advance(600_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shown()).toBe(false);
  });

  it.each([
    ['a lesson', 'app', '/courses/python/lessons/l1'],
    ['a quiz attempt', 'app', '/quizzes/l1/attempt/a1'],
    ['the checkout', 'site', '/courses/python/subscribe'],
    ['the register page', 'auth', '/register'],
    ['the sign-in page', 'auth', '/login'],
  ] as const)('never counts on %s', async (_label, surface, path) => {
    pathname = path;
    respond(VISITOR);
    render(<GuideLauncher surface={surface} face={null} />);
    await advance(GUIDE_DELAY_MS * 4);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shown()).toBe(false);
  });

  it('opens for a signed-in student who has not enrolled or paid, at home', async () => {
    pathname = '/dashboard';
    respond({
      '/api/session': { status: 200, body: { role: 'student' } },
      '/api/enrollments': { status: 200, body: [] },
      '/api/payments/submissions/me': { status: 200, body: [] },
    });
    render(<GuideLauncher surface="app" face={null} />);
    await advance(GUIDE_DELAY_MS);
    await settle();
    expect(shown()).toBe(true);
  });

  it('never opens for an enrolled student, and stops asking on that device', async () => {
    pathname = '/dashboard';
    respond({
      '/api/session': { status: 200, body: { role: 'student' } },
      '/api/enrollments': { status: 200, body: [{ courseId: 'c1' }] },
      '/api/payments/submissions/me': { status: 200, body: [] },
    });
    render(<GuideLauncher surface="app" face={null} />);
    await advance(GUIDE_DELAY_MS);
    await settle();
    expect(shown()).toBe(false);
    expect(window.sessionStorage.getItem(GUIDE_STATE_KEY)).toBeNull();
    expect(window.localStorage.getItem(GUIDE_SEEN_KEY)).toBe('1');
  });

  it('never opens for a guardian on a public page', async () => {
    respond({ '/api/session': { status: 401 }, '/api/guardian/me': { status: 200, body: {} } });
    render(<GuideLauncher surface="site" face={null} />);
    await advance(GUIDE_DELAY_MS);
    await settle();
    expect(shown()).toBe(false);
    expect(window.localStorage.getItem(GUIDE_SEEN_KEY)).toBe('1');
  });

  it('never opens for staff', async () => {
    pathname = '/dashboard';
    respond({ '/api/session': { status: 200, body: { role: 'owner' } } });
    render(<GuideLauncher surface="app" face={null} />);
    await advance(GUIDE_DELAY_MS);
    await settle();
    expect(shown()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does nothing — and decides nothing — when the API cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<GuideLauncher surface="site" face={null} />);
    await advance(GUIDE_DELAY_MS);
    await settle();
    expect(shown()).toBe(false);
    // Not marked: a blip must not silence the guide for a new visitor forever.
    expect(window.localStorage.getItem(GUIDE_SEEN_KEY)).toBeNull();
  });

  it('waits its turn while something else is open, then appears', async () => {
    respond(VISITOR);
    const other = document.createElement('div');
    other.setAttribute('role', 'dialog');
    document.body.append(other);
    render(<GuideLauncher surface="site" face={null} />);

    await advance(GUIDE_DELAY_MS);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shown()).toBe(false);

    other.remove();
    await advance(5_000);
    await settle();
    expect(shown()).toBe(true);
  });

  it('resumes a guide in progress at once, even on a device marked as seen', async () => {
    pathname = '/register';
    window.localStorage.setItem(GUIDE_SEEN_KEY, '1');
    window.sessionStorage.setItem(GUIDE_STATE_KEY, JSON.stringify({ ...INITIAL_GUIDE_STATE, open: false }));
    render(<GuideLauncher surface="auth" face={null} />);
    await settle();
    expect(shown()).toBe(true);
    // No probe: this guide was started by somebody, in this tab.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not load the guide on a page that has nothing of it to draw', async () => {
    pathname = '/courses/python/lessons/l1';
    window.sessionStorage.setItem(GUIDE_STATE_KEY, JSON.stringify(INITIAL_GUIDE_STATE));
    render(<GuideLauncher surface="app" face={null} />);
    await advance(GUIDE_DELAY_MS * 2);
    expect(shown()).toBe(false);
  });

  it('removes its listener and its timer when the page is left', async () => {
    respond(VISITOR);
    const remove = vi.spyOn(document, 'removeEventListener');
    const set = vi.spyOn(window, 'setTimeout');
    const clear = vi.spyOn(window, 'clearTimeout');
    const view = render(<GuideLauncher surface="site" face={null} />);
    await advance(5_000);

    // The one timer the launcher holds: the remainder of the thirty seconds.
    const countdown = set.mock.results[set.mock.calls.findIndex(([, ms]) => ms === GUIDE_DELAY_MS)]!.value;
    view.unmount();

    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(clear).toHaveBeenCalledWith(countdown);
    // No interval anywhere — a hidden or departed page holds nothing.
    expect(set.mock.calls.filter(([, ms]) => ms === GUIDE_DELAY_MS)).toHaveLength(1);
    set.mockRestore();
    clear.mockRestore();
    // Nothing fires after it is gone.
    await vi.advanceTimersByTimeAsync(GUIDE_DELAY_MS * 2);
    expect(fetchMock).not.toHaveBeenCalled();
    remove.mockRestore();
  });
});

describe('the chunk split', () => {
  it('keeps the guide out of the launcher’s static imports', async () => {
    // The launcher is in three layouts. Anything it imports statically is on
    // every page; the guide must only ever be reached through `import()`.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const read = (file: string) => readFileSync(join(import.meta.dirname, file), 'utf8');
    const staticImports = (source: string) =>
      [...source.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gm)].map((match) => match[1]!);

    expect(staticImports(read('guide-launcher.tsx')).sort()).toEqual(['./guide-gate', 'next/navigation', 'react']);
    expect(read('guide-launcher.tsx')).toContain("import('./guide-root')");
    // …and the gate module it leans on imports nothing at all.
    expect(staticImports(read('guide-gate.ts'))).toEqual([]);
    // The server slot may reach the launcher and server-only loaders, nothing
    // of the guide's own.
    expect(staticImports(read('guide-slot.tsx')).filter((path) => path.startsWith('./'))).toEqual([
      './guide-launcher',
    ]);
  });
});
