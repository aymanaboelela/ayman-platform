import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emitQueueFrame,
  emitStreamDown,
  emitStreamOpen,
} from '@/components/notifications/live-bus';
import { LIVE_MIN_GAP_MS, useLiveQueue } from './use-live-queue';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Lets the resolved `sync` promise's `.finally` run. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useLiveQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });
  afterEach(() => {
    act(() => emitStreamDown());
    vi.useRealTimers();
  });

  it('re-reads when the desk moves — and a burst of frames is ONE read now, one after the gap', async () => {
    const sync = vi.fn(() => Promise.resolve());
    renderHook(() => useLiveQueue('payments', sync));

    act(() => {
      emitQueueFrame('payments', 1);
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    await flush();
    expect(sync).toHaveBeenCalledTimes(1);

    // Twenty claims approved by one transfer capture, all at once.
    act(() => {
      for (let waiting = 20; waiting > 0; waiting -= 1) emitQueueFrame('payments', waiting);
    });
    act(() => {
      vi.advanceTimersByTime(LIVE_MIN_GAP_MS - 1);
    });
    expect(sync).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    await flush();
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('reads nothing while the tab is hidden, and exactly once when it is looked at again', async () => {
    const sync = vi.fn(() => Promise.resolve());
    renderHook(() => useLiveQueue('payments', sync));

    setVisibility('hidden');
    act(() => {
      emitQueueFrame('payments', 1);
      emitQueueFrame('payments', 2);
      vi.advanceTimersByTime(60_000);
    });
    expect(sync).not.toHaveBeenCalled();

    act(() => setVisibility('visible'));
    act(() => {
      vi.advanceTimersByTime(0);
    });
    await flush();
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('re-reads when the stream comes back — frames sent while it was down are gone', async () => {
    const sync = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useLiveQueue('payments', sync));
    expect(result.current.live).toBe(false);

    act(() => emitStreamOpen());
    expect(result.current.live).toBe(true);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    await flush();
    expect(sync).toHaveBeenCalledTimes(1);

    act(() => emitStreamDown());
    expect(result.current.live).toBe(false);
  });

  it('only ever hears its own queue', () => {
    const sync = vi.fn(() => Promise.resolve());
    renderHook(() => useLiveQueue('payments', sync));
    act(() => {
      // A queue this build does not know yet — the bus is keyed, not broadcast.
      emitQueueFrame('book-orders' as never, 3);
      vi.advanceTimersByTime(10_000);
    });
    expect(sync).not.toHaveBeenCalled();
  });

  it('lets go of everything when the page is left — no read behind the admin’s back, and the one in flight is cancelled', async () => {
    let signal: AbortSignal | null = null;
    const sync = vi.fn((s: AbortSignal) => {
      signal = s;
      return new Promise<void>(() => undefined);
    });
    const { unmount } = renderHook(() => useLiveQueue('payments', sync));

    act(() => {
      emitQueueFrame('payments', 1);
      vi.advanceTimersByTime(0);
    });
    expect(sync).toHaveBeenCalledTimes(1);

    unmount();
    expect(signal!.aborted).toBe(true);

    act(() => {
      emitQueueFrame('payments', 2);
      emitStreamOpen();
      vi.advanceTimersByTime(60_000);
    });
    expect(sync).toHaveBeenCalledTimes(1);
  });
});
