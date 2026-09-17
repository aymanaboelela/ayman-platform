import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The loader's failure modes, which are the ones a student actually hits.
 *
 * Every test re-imports the module: `pending` is module-level state by design
 * (the script is requested at most once per document), so a shared instance
 * would let one test's outcome decide the next one's.
 */
async function freshLoader() {
  vi.resetModules();
  return (await import('./youtube')).loadYouTubeIframeApi;
}

function injectedScript(): HTMLScriptElement {
  const script = document.head.querySelector('script[src*="iframe_api"]');
  expect(script).not.toBeNull();
  return script as HTMLScriptElement;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  // Any load left in flight still holds a readiness timer; firing it after the
  // test that made it would reject with nobody listening.
  vi.clearAllTimers();
  vi.useRealTimers();
  document.head.querySelectorAll('script').forEach((node) => node.remove());
  delete window.YT;
  delete window.onYouTubeIframeAPIReady;
});

describe('loadYouTubeIframeApi', () => {
  it('resolves when the API announces itself', async () => {
    const load = await freshLoader();
    const promise = load();
    window.YT = { Player: vi.fn() } as unknown as typeof window.YT;
    window.onYouTubeIframeAPIReady?.();
    await expect(promise).resolves.toBeDefined();
  });

  /**
   * The reported failure: a network that ANSWERS the request with something
   * other than the API. `onerror` never fires, so before the timeout this
   * promise simply never settled — the player awaited it forever, having
   * already torn its own poster down, and drew an empty grey box with no
   * message on it.
   */
  it('rejects when the script loads but the API never becomes ready', async () => {
    const load = await freshLoader();
    const promise = load();
    const settled = vi.fn();
    void promise.catch(settled);

    await vi.advanceTimersByTimeAsync(11_000);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(settled).toHaveBeenCalled();
  });

  it('lets a retry request the script again after a timeout', async () => {
    const load = await freshLoader();
    // The handler is attached BEFORE the clock moves: a rejection that lands
    // on a promise nobody is holding yet is an unhandled rejection, and
    // vitest fails the run on one even though the assertion passes.
    const first = load();
    const rejected = expect(first).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(13_000);
    await rejected;

    // A cached rejected promise would make «نجرّب تاني» a button that can
    // never succeed, so the second call must reach the network again.
    document.head.querySelectorAll('script').forEach((node) => node.remove());
    const second = load();
    expect(injectedScript()).toBeTruthy();
    window.YT = { Player: vi.fn() } as unknown as typeof window.YT;
    window.onYouTubeIframeAPIReady?.();
    await expect(second).resolves.toBeDefined();
  });

  it('stops the timeout once the API has resolved', async () => {
    const load = await freshLoader();
    const promise = load();
    window.YT = { Player: vi.fn() } as unknown as typeof window.YT;
    window.onYouTubeIframeAPIReady?.();
    await expect(promise).resolves.toBeDefined();

    // Nothing is left armed to fire a rejection at an already-playing video.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases the retry on a network error too', async () => {
    const load = await freshLoader();
    const promise = load();
    injectedScript().onerror?.(new Event('error'));
    await expect(promise).rejects.toThrow();

    document.head.querySelectorAll('script').forEach((node) => node.remove());
    const retried = load();
    void retried.catch(() => {});
    expect(injectedScript()).toBeTruthy();
  });
});
