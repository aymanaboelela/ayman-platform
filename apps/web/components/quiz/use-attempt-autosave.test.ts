import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/lib/api';
import { useAttemptAutosave } from './use-attempt-autosave';

const apiPutTyped = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiPutTyped };
});

function okResult(overrides: Partial<{ savedSlots: number[] }> = {}) {
  return {
    savedSlots: overrides.savedSlots ?? [0],
    serverTime: '2026-01-01T00:00:00.000Z',
    deadlineAt: null,
    answeredCount: 1,
  };
}

/**
 * `waitFor` polls via `setTimeout`, which fake timers freeze — draining the
 * microtask queue directly (a promise's `.then`/`.catch`/`.finally` chain is
 * NOT a fake-timer-controlled macrotask) is what actually lets an already-
 * resolved/rejected mock's continuation run inside an `act()` batch.
 */
async function drainMicrotasks(times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

describe('useAttemptAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiPutTyped.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('increments seq on every send so an out-of-order reply cannot clobber', async () => {
    apiPutTyped.mockResolvedValue(okResult());
    const { result } = renderHook(() =>
      useAttemptAutosave({ attemptId: 'a1', attemptToken: 'tok', initialSeq: 7 }),
    );

    act(() => result.current.setAnswer(0, { kind: 'choice', optionIds: ['x'] }));
    act(() => {
      // Discarded deliberately: `flushNow` returns a promise now (so
      // `openSubmitDialog` can await the write before reading the server's
      // unanswered count). Returning it from a synchronous `act` would open
      // an async act scope nobody awaits, and every later render in the file
      // comes back null. These cases drive the request with fake timers and
      // `drainMicrotasks` instead.
      void result.current.flushNow();
    });
    await act(() => drainMicrotasks());
    expect(apiPutTyped).toHaveBeenCalledTimes(1);
    expect(apiPutTyped.mock.calls[0]![2]).toMatchObject({ seq: 8 });

    act(() => result.current.setAnswer(1, { kind: 'choice', optionIds: ['y'] }));
    act(() => {
      void result.current.flushNow();
    });
    await act(() => drainMicrotasks());
    expect(apiPutTyped).toHaveBeenCalledTimes(2);
    expect(apiPutTyped.mock.calls[1]![2]).toMatchObject({ seq: 9 });
  });

  it('coalesces rapid edits into one request per flush', async () => {
    apiPutTyped.mockResolvedValue(okResult({ savedSlots: [0, 1, 2] }));
    const { result } = renderHook(() =>
      useAttemptAutosave({ attemptId: 'a1', attemptToken: 'tok', initialSeq: 1 }),
    );

    act(() => {
      result.current.setAnswer(0, { kind: 'text', text: 'a' });
      result.current.setAnswer(1, { kind: 'text', text: 'b' });
      result.current.setAnswer(2, { kind: 'text', text: 'c' });
    });
    act(() => {
      void result.current.flushNow();
    });
    await act(() => drainMicrotasks());

    expect(apiPutTyped).toHaveBeenCalledTimes(1);
    const body = apiPutTyped.mock.calls[0]![2] as { answers: unknown[] };
    expect(body.answers).toHaveLength(3);
  });

  it('flushes on the 15s interval and reports saved status', async () => {
    apiPutTyped.mockResolvedValue(okResult());
    const onSaved = vi.fn();
    const { result } = renderHook(() =>
      useAttemptAutosave({ attemptId: 'a1', attemptToken: 'tok', initialSeq: 1, onSaved }),
    );

    act(() => result.current.setAnswer(0, { kind: 'text', text: 'hi' }));
    act(() => vi.advanceTimersByTime(15_000));
    await act(() => drainMicrotasks());

    expect(apiPutTyped).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('saved');
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ answeredCount: 1 }));
  });

  it('flushes on visibilitychange → hidden, with keepalive', async () => {
    apiPutTyped.mockResolvedValue(okResult());
    const { result } = renderHook(() =>
      useAttemptAutosave({ attemptId: 'a1', attemptToken: 'tok', initialSeq: 1 }),
    );

    act(() => result.current.setAnswer(0, { kind: 'text', text: 'hi' }));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(() => drainMicrotasks());

    expect(apiPutTyped).toHaveBeenCalledTimes(1);
    expect(apiPutTyped.mock.calls[0]![3]).toMatchObject({ keepalive: true });
  });

  it('stops retrying and reports staleTab on a 409, and never sends again', async () => {
    apiPutTyped.mockRejectedValue(new ApiRequestError(409, '/api/quiz/attempts/a1/answers'));
    const onStale = vi.fn();
    const { result } = renderHook(() =>
      useAttemptAutosave({ attemptId: 'a1', attemptToken: 'tok', initialSeq: 1, onStale }),
    );

    act(() => result.current.setAnswer(0, { kind: 'text', text: 'hi' }));
    act(() => {
      void result.current.flushNow();
    });
    await act(() => drainMicrotasks());
    expect(result.current.status).toBe('stale');
    expect(onStale).toHaveBeenCalledTimes(1);

    // A stale tab must not retry forever, and a further edit must not
    // resurrect sending either.
    act(() => result.current.setAnswer(1, { kind: 'text', text: 'more' }));
    act(() => {
      void result.current.flushNow();
    });
    act(() => vi.advanceTimersByTime(60_000));
    await act(() => drainMicrotasks());
    expect(apiPutTyped).toHaveBeenCalledTimes(1);
  });

  it('retries a 5xx with backoff rather than giving up', async () => {
    apiPutTyped
      .mockRejectedValueOnce(new ApiRequestError(500, '/api/quiz/attempts/a1/answers'))
      .mockResolvedValueOnce(okResult());
    const { result } = renderHook(() =>
      useAttemptAutosave({ attemptId: 'a1', attemptToken: 'tok', initialSeq: 1 }),
    );

    act(() => result.current.setAnswer(0, { kind: 'text', text: 'hi' }));
    act(() => {
      void result.current.flushNow();
    });
    await act(() => drainMicrotasks());
    expect(apiPutTyped).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('error');

    act(() => vi.advanceTimersByTime(1_000));
    await act(() => drainMicrotasks());
    expect(apiPutTyped).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('saved');
  });
});
