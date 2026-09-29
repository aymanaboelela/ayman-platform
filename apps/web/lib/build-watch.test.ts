import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_RELOAD_MARK,
  BUILD_ID_PATH,
  CHECK_EVERY_MS,
  MIN_GAP_MS,
  fetchServerBuild,
  watchBuild,
} from './build-watch';

/**
 * The proactive half of the stale-tab fix. What is pinned here is the part
 * that is invisible when wrong in BOTH directions: asking too eagerly costs
 * every open tab a request per alt-tab, and reloading at the wrong moment
 * throws away what someone typed — the exact loss this exists to prevent.
 */

let visibility: DocumentVisibilityState = 'visible';

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Lets the awaited `ask()` resolve and the code after it run. */
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

function start(answer: string | null = 'b-new') {
  const ask = vi.fn<() => Promise<string | null>>().mockResolvedValue(answer);
  const onStale = vi.fn();
  const reload = vi.fn();
  const stop = watchBuild({ running: 'b-old', onStale, fetchServerBuild: ask, reload });
  return { ask, onStale, reload, stop };
}

describe('watchBuild — when it asks', () => {
  it('does not ask on a focus right after the page loaded', async () => {
    const { ask, stop } = start();
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(ask).not.toHaveBeenCalled();
    stop();
  });

  it('asks on window focus once the gap has passed, and reports the new build', async () => {
    const { ask, onStale, stop } = start();
    vi.advanceTimersByTime(MIN_GAP_MS);
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(onStale).toHaveBeenCalledWith('b-new');
    stop();
  });

  it('asks when the tab becomes visible again', async () => {
    const { ask, onStale, stop } = start();
    setVisibility('hidden');
    vi.advanceTimersByTime(MIN_GAP_MS);
    setVisibility('visible');
    await flush();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(onStale).toHaveBeenCalledTimes(1);
    stop();
  });

  it('asks on the interval while visible, and not while hidden', async () => {
    const { ask, stop } = start('b-old');
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(ask).toHaveBeenCalledTimes(1);

    visibility = 'hidden'; // no event: only the timer is running now
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 3);
    expect(ask).toHaveBeenCalledTimes(1);
    stop();
  });

  it('collapses a focus + visibility pair into one ask', async () => {
    const { ask, stop } = start('b-old');
    vi.advanceTimersByTime(MIN_GAP_MS);
    setVisibility('visible');
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(ask).toHaveBeenCalledTimes(1);
    stop();
  });

  it('says nothing while the server runs the same build', async () => {
    const { onStale, stop } = start('b-old');
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 2);
    expect(onStale).not.toHaveBeenCalled();
    stop();
  });

  it('treats "could not tell" (the deploy-window 404) as no answer, and asks again later', async () => {
    const { ask, onStale, stop } = start(null);
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(onStale).not.toHaveBeenCalled();
    ask.mockResolvedValue('b-new');
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(onStale).toHaveBeenCalledWith('b-new');
    stop();
  });

  it('stops asking once it knows — the answer cannot change back', async () => {
    const { ask, onStale, stop } = start();
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 4);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(onStale).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does nothing after teardown', async () => {
    const { ask, stop } = start();
    stop();
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 2);
    window.dispatchEvent(new Event('focus'));
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('watchBuild — reloading on its own', () => {
  async function becomeStale() {
    const handle = start();
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(handle.onStale).toHaveBeenCalled();
    return handle;
  }

  it('never while the tab is visible — the toast is the answer there', async () => {
    const { reload, stop } = await becomeStale();
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 2);
    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it('reloads when a clean page is left in the background', async () => {
    const { reload, stop } = await becomeStale();
    setVisibility('hidden');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(AUTO_RELOAD_MARK)).toBe('b-new');
    stop();
  });

  it('does NOT reload a page where something was typed', async () => {
    const textarea = document.createElement('textarea');
    document.body.append(textarea);
    const { reload, stop } = await becomeStale();

    textarea.value = 'نص الواجب لسه ماتحفظش';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    setVisibility('hidden');

    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it('does NOT reload a page where an answer was ticked or a file chosen', async () => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    document.body.append(input);
    const { reload, stop } = await becomeStale();

    input.dispatchEvent(new Event('change', { bubbles: true }));
    setVisibility('hidden');

    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it('does NOT reload a page with a player on it', async () => {
    document.body.append(document.createElement('iframe'));
    const { reload, stop } = await becomeStale();
    setVisibility('hidden');
    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it('reloads at most once per server build — a reload onto the old container must not loop', async () => {
    window.sessionStorage.setItem(AUTO_RELOAD_MARK, 'b-new');
    const { reload, stop } = await becomeStale();
    setVisibility('hidden');
    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it('fails closed when sessionStorage throws', async () => {
    // Safari's private mode: the getter works and every write throws. jsdom's
    // Storage ignores a prototype spy, so the whole object is swapped.
    const real = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      },
    });
    try {
      const { reload, stop } = await becomeStale();
      setVisibility('hidden');
      expect(reload).not.toHaveBeenCalled();
      stop();
    } finally {
      Object.defineProperty(window, 'sessionStorage', { configurable: true, value: real });
    }
  });
});

describe('fetchServerBuild', () => {
  it('reads the build id, uncached', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ buildId: 'b20260930120000' }));
    await expect(fetchServerBuild()).resolves.toBe('b20260930120000');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url).startsWith(`${BUILD_ID_PATH}?`)).toBe(true);
    expect(init?.cache).toBe('no-store');
  });

  it.each([
    ['a deploy-window 404', () => Promise.resolve(new Response('', { status: 404 }))],
    ['a 502', () => Promise.resolve(new Response('', { status: 502 }))],
    ['an HTML challenge page', () => Promise.resolve(new Response('<html></html>', { status: 200 }))],
    ['a build without the variable', () => Promise.resolve(Response.json({ buildId: null }))],
    ['no network', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('answers null for %s', async (_label, respond) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(respond);
    await expect(fetchServerBuild()).resolves.toBeNull();
  });
});

describe('BUILD_ID_PATH', () => {
  /*
   * `public/sw.js` answers exactly one prefix from its cache, and Traefik sends
   * `/api/*` to Nest instead of this app. The endpoint must sit outside both,
   * or the first answer would be pinned on the device forever (and the check
   * could never see a deploy), or the request would never reach the build it
   * is asking about.
   */
  it('is outside the one prefix the service worker caches, and outside Nest', () => {
    const sw = readFileSync(resolve(import.meta.dirname, '..', 'public', 'sw.js'), 'utf8');
    expect(sw).toContain("const isImmutable = url.pathname.startsWith('/_next/static/');");
    expect(BUILD_ID_PATH.startsWith('/_next/static/')).toBe(false);
    expect(BUILD_ID_PATH.startsWith('/api/')).toBe(false);
  });

  it('is served by the route handler that sits at that path', () => {
    const route = resolve(import.meta.dirname, '..', 'app', BUILD_ID_PATH.slice(1), 'route.ts');
    const source = readFileSync(route, 'utf8');
    expect(source).toContain("'Cache-Control': 'no-store'");
    expect(source).toContain('process.env.NEXT_PUBLIC_BUILD_ID');
  });
});
