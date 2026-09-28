import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { HINT_AFTER_MS, RELOAD_AFTER_MS, RouteLoadingWatchdog } from './route-loading-watchdog';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

const reload = vi.fn();
let visibility: DocumentVisibilityState = 'visible';

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  // jsdom's `location.reload` is not configurable in place; see use-error-retry.test.
  vi.stubGlobal('location', { ...window.location, pathname: '/dashboard', reload });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('RouteLoadingWatchdog', () => {
  it('does nothing to a skeleton that is replaced in time', () => {
    // The normal case — every healthy load. The page lands, Next swaps the
    // fallback out, the watchdog unmounts, and nobody ever knows it was there.
    const { unmount } = render(<RouteLoadingWatchdog />);
    wait(HINT_AFTER_MS - 1_000);
    unmount();
    wait(RELOAD_AFTER_MS * 2);

    expect(toast).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('tells the student, then reloads, when the skeleton outlives any honest load', () => {
    render(<RouteLoadingWatchdog />);

    wait(HINT_AFTER_MS);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();

    wait(RELOAD_AFTER_MS - HINT_AFTER_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('takes its toast away with it once the page arrives', () => {
    const { unmount } = render(<RouteLoadingWatchdog />);
    wait(HINT_AFTER_MS);
    unmount();
    expect(toast.dismiss).toHaveBeenCalled();
  });

  it('reloads a path once, not every twenty seconds', () => {
    // The reload landed on the same stuck skeleton: the cause is not in this
    // tab, and a page that keeps reloading itself is worse than one that waits.
    const first = render(<RouteLoadingWatchdog />);
    wait(RELOAD_AFTER_MS);
    expect(reload).toHaveBeenCalledTimes(1);
    first.unmount();

    render(<RouteLoadingWatchdog />);
    wait(RELOAD_AFTER_MS * 3);
    expect(reload).toHaveBeenCalledTimes(1);
    // …but the student is still offered the button.
    expect(toast).toHaveBeenCalledTimes(2);
  });

  it('allows a new attempt once the window has passed', () => {
    const first = render(<RouteLoadingWatchdog />);
    wait(RELOAD_AFTER_MS);
    first.unmount();

    vi.setSystemTime(Date.now() + 6 * 60_000);
    render(<RouteLoadingWatchdog />);
    wait(RELOAD_AFTER_MS);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload at all when it cannot record that it did', () => {
    // Safari private mode: an unrecorded reload is an unbounded one.
    const throws = () => {
      throw new Error('SecurityError');
    };
    vi.stubGlobal('sessionStorage', { getItem: throws, setItem: throws });
    render(<RouteLoadingWatchdog />);
    wait(RELOAD_AFTER_MS * 2);

    expect(reload).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('only counts time someone is looking at it', () => {
    visibility = 'hidden';
    render(<RouteLoadingWatchdog />);
    wait(RELOAD_AFTER_MS * 3);
    expect(toast).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    visibility = 'visible';
    wait(RELOAD_AFTER_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
