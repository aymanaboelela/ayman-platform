import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBackDismiss } from './use-back-dismiss';

/**
 * The back gesture is the one input this product cannot poll for in a test
 * browser and cannot fake in Playwright either — `page.goBack()` drives the
 * same session history, but the phone gestures that matter (edge swipe, the
 * three-button bar) only exist on a device. So the contract is pinned here, at
 * the level the hook actually reasons about: entries pushed onto
 * `window.history`, and the `popstate` that comes back.
 *
 * jsdom implements same-document session history, so `history.back()` really
 * does traverse and really does fire `popstate` — asynchronously, as in a
 * browser, which is why every press below is awaited rather than asserted on
 * the next line.
 */
async function pressBack(): Promise<void> {
  await act(async () => {
    // Waited for by EVENT, not by a fixed number of ticks. jsdom queues the
    // traversal and fires `popstate` several tasks later — a `setTimeout(0)`
    // sees the old entry still current and passes or fails depending on how
    // busy the run is, which is exactly the flake this suite must not have.
    // The race is a fuse: nothing left to go back to means no event, and a
    // hung promise is a five-second timeout instead of a readable failure.
    const landed = new Promise<void>((resolve) => {
      window.addEventListener('popstate', () => resolve(), { once: true });
    });
    window.history.back();
    await Promise.race([landed, new Promise((resolve) => setTimeout(resolve, 500))]);
    // One more turn for the listeners that ran on that event to settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  // Unmount whatever a failing assertion skipped past. The stops a hook holds
  // live in module scope, so one leaked mount would make every later test read
  // its press as somebody else's and pass or fail for the wrong reason.
  cleanup();
  // Each test leaves its own entries behind; reset to a known state so the
  // next one's `history.back()` traverses what it pushed and nothing else.
  window.history.replaceState(null, '', '/');
});

describe('useBackDismiss', () => {
  it('pushes a stop and dismisses on the back press, without leaving the page', async () => {
    const onBack = vi.fn();
    const before = window.location.href;

    const { unmount } = renderHook(() => useBackDismiss(onBack));

    // The stop is a duplicate: same url, one more entry to spend.
    expect(window.location.href).toBe(before);

    await pressBack();

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe(before);
    unmount();
  });

  it('hands the press to the innermost stop only', async () => {
    const outer = vi.fn();
    const inner = vi.fn();

    const outerRender = renderHook(() => useBackDismiss(outer));
    const innerRender = renderHook(() => useBackDismiss(inner));

    await pressBack();

    // A dialog over a drawer: the dialog closes, the drawer does not, and the
    // route underneath both stays exactly where it was.
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();

    innerRender.unmount();
    await pressBack();
    expect(outer).toHaveBeenCalledTimes(1);
    outerRender.unmount();
  });

  it('re-arms when asked, so a second press is caught too', async () => {
    const onBack = vi.fn();
    const { unmount } = renderHook(() => useBackDismiss(onBack, { rearm: true }));

    await pressBack();
    await pressBack();
    await pressBack();

    // The exam guard: every press asks, none of them leaves.
    expect(onBack).toHaveBeenCalledTimes(3);
    unmount();
  });

  it('stands down on release, so a submitted attempt stops asking', async () => {
    const onBack = vi.fn();
    const { result, unmount } = renderHook(() => useBackDismiss(onBack, { rearm: true }));

    act(() => result.current.release());
    await pressBack();

    expect(onBack).not.toHaveBeenCalled();
    unmount();
  });

  it('survives the Strict Mode remount with one stop, not two', async () => {
    window.history.replaceState({ marker: 'the page itself' }, '');
    const onBack = vi.fn();

    const { unmount } = renderHook(() => useBackDismiss(onBack), { wrapper: StrictMode });

    // React runs the effect, tears it down and runs it again in development.
    // The second run has to recognise the stop the first one pushed and adopt
    // it: two stops here means every dialog in `next dev` costs two back
    // presses to close, which is the kind of bug that gets "fixed" by deleting
    // the feature.
    await pressBack();

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(window.history.state).toEqual({ marker: 'the page itself' });
    unmount();
  });

  it('reuses the entry a closed overlay left behind instead of stacking another', async () => {
    window.history.replaceState({ marker: 'the page itself' }, '');

    // Four overlays opened and closed by the X, the way a student pokes at a
    // drawer — closing deliberately does not pop, so each one leaves a spent
    // duplicate of this page behind.
    for (let i = 0; i < 4; i += 1) renderHook(() => useBackDismiss(vi.fn())).unmount();

    await pressBack();

    // ONE press to get back to the page's own entry, not four: each overlay
    // adopted the duplicate the last one left rather than stacking its own.
    // The exact state object also proves the adopted entry carried the page's
    // own state forward — under Next that object is `__NA` plus the router
    // tree, and an entry missing it makes the app-router reload the page.
    expect(window.history.state).toEqual({ marker: 'the page itself' });
  });
});
