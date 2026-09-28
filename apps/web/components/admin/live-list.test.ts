import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitQueueFrame } from '@/components/notifications/live-bus';
import { FRESH_MS, useLiveList } from './live-list';

interface Page {
  rows: { id: string }[];
  rowCount: number;
}

const page = (...ids: string[]): Page => ({ rows: ids.map((id) => ({ id })), rowCount: ids.length });

async function frame() {
  act(() => {
    emitQueueFrame('payments', 0);
    vi.advanceTimersByTime(0);
  });
  // The read resolves, then `setData` lands.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useLiveList', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('puts a claim that arrived on screen and marks only it as new — until it has been seen a while', async () => {
    const read = vi.fn(() => Promise.resolve(page('a', 'b', 'c')));
    // One object, as the server hands it over — its identity is what says
    // «a new server render landed».
    const initial = page('a', 'b');
    const { result } = renderHook(() => useLiveList('payments', initial, read));

    await frame();

    expect(result.current.data.rows.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect([...result.current.fresh]).toEqual(['c']);

    act(() => {
      vi.advanceTimersByTime(FRESH_MS);
    });
    expect(result.current.fresh.size).toBe(0);
  });

  it('drops a claim another admin decided — without calling anything new', async () => {
    const read = vi.fn(() => Promise.resolve(page('b')));
    const initial = page('a', 'b');
    const { result } = renderHook(() => useLiveList('payments', initial, read));

    await frame();

    expect(result.current.data.rows.map((row) => row.id)).toEqual(['b']);
    expect(result.current.fresh.size).toBe(0);
  });

  it('a server render that lands mid-read wins — the read is thrown away, not painted over it', async () => {
    let resolveRead: (value: Page) => void = () => undefined;
    const read = vi.fn(
      () =>
        new Promise<Page>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const { result, rerender } = renderHook(({ initial }) => useLiveList('payments', initial, read), {
      initialProps: { initial: page('a', 'b') },
    });

    act(() => {
      emitQueueFrame('payments', 0);
      vi.advanceTimersByTime(0);
    });
    expect(read).toHaveBeenCalledTimes(1);

    // The admin pressed «وافق» on `a`; the action refreshed the route.
    rerender({ initial: page('b') });
    expect(result.current.data.rows.map((row) => row.id)).toEqual(['b']);

    // The read that started BEFORE the approval now answers with `a` still pending.
    await act(async () => {
      resolveRead(page('a', 'b'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.data.rows.map((row) => row.id)).toEqual(['b']);
  });
});
