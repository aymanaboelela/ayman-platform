import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedReorder } from './use-debounced-reorder';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `l${i}`);

describe('useDebouncedReorder', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses many rapid drags into ONE commit', async () => {
    const onCommit = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() =>
      useDebouncedReorder({ initial: ids(40), onCommit, delayMs: 600 }),
    );

    for (let i = 0; i < 10; i += 1) {
      act(() => result.current.move(39 - i, 0));
    }
    expect(onCommit).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0]).toHaveLength(40);
  });

  it('sends the FULL ordered array, not a delta', async () => {
    const onCommit = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() =>
      useDebouncedReorder({ initial: ids(5), onCommit, delayMs: 100 }),
    );

    act(() => result.current.move(4, 0));
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(onCommit).toHaveBeenCalledWith(['l4', 'l0', 'l1', 'l2', 'l3']);
  });

  it('reverts to the last committed order when the write fails', async () => {
    const onCommit = vi.fn().mockResolvedValue({ ok: false, message: 'boom' });
    const { result } = renderHook(() =>
      useDebouncedReorder({ initial: ids(3), onCommit, delayMs: 10 }),
    );

    act(() => result.current.move(2, 0));
    expect(result.current.items).toEqual(['l2', 'l0', 'l1']);

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    expect(result.current.items).toEqual(['l0', 'l1', 'l2']);
    expect(result.current.status).toBe('error');
  });

  it('does not commit when the order is unchanged', async () => {
    const onCommit = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() =>
      useDebouncedReorder({ initial: ids(3), onCommit, delayMs: 10 }),
    );

    act(() => result.current.move(1, 1));
    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('flushes a pending write on unmount so a navigation cannot drop it', async () => {
    const onCommit = vi.fn().mockResolvedValue({ ok: true });
    const { result, unmount } = renderHook(() =>
      useDebouncedReorder({ initial: ids(3), onCommit, delayMs: 5000 }),
    );

    act(() => result.current.move(2, 0));
    unmount();

    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
