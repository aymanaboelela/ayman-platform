import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExamSignals } from './use-exam-signals';

const apiPost = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiPost };
});

/** Every signal the hook has sent, across every batch, in order. */
function sent(): Array<{ type: string; slot?: number; chars?: number; text?: string; awayMs?: number }> {
  return apiPost.mock.calls.flatMap((call) => (call[2] as { signals: [] }).signals);
}

function paste(text: string) {
  const event = new Event('paste', { bubbles: true }) as Event & { clipboardData: unknown };
  event.clipboardData = { getData: () => text };
  document.dispatchEvent(event);
}

/** Lets a resolved send's `.finally` run, which is what frees the next one. */
async function drain(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useExamSignals', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiPost.mockReset();
    apiPost.mockResolvedValue({ recorded: 1 });
  });

  afterEach(() => {
    // Unmounted here, not left to the next test: a mounted hook keeps its
    // document listeners and would report into that test's batches.
    cleanup();
    setVisibility('visible');
    vi.useRealTimers();
  });

  it('sends nothing at all when the server did not ask for it', () => {
    const { unmount } = renderHook(() => useExamSignals({ enabled: false, attemptId: 'a1', currentSlot: 0 }));
    paste('anything');
    act(() => vi.advanceTimersByTime(30_000));
    unmount();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('records a paste on the question on screen, with the pasted text', async () => {
    const { rerender } = renderHook((props) => useExamSignals(props), {
      initialProps: { enabled: true, attemptId: 'a1', currentSlot: 0 },
    });
    rerender({ enabled: true, attemptId: 'a1', currentSlot: 2 });
    await act(async () => {
      await Promise.resolve();
    });
    paste('answer from a chatbot');
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });

    expect(apiPost.mock.calls[0]![0]).toBe('/api/quiz/attempts/a1/signals');
    expect(sent()).toContainEqual(
      expect.objectContaining({ type: 'paste', slot: 2, chars: 21, text: 'answer from a chatbot' }),
    );
  });

  it('records leaving the tab and how long the student was away', async () => {
    renderHook(() => useExamSignals({ enabled: true, attemptId: 'a1', currentSlot: 0 }));
    await act(drain);
    setVisibility('hidden');
    await act(async () => {
      vi.advanceTimersByTime(45_000);
      await drain();
    });
    setVisibility('visible');
    await act(drain);

    const types = sent().map((signal) => signal.type);
    expect(types).toEqual(expect.arrayContaining(['opened', 'hidden', 'visible']));
    expect(sent().find((signal) => signal.type === 'visible')?.awayMs).toBe(45_000);
  });

  it('reads an unmount as leaving the exam, unless the paper was handed in', async () => {
    const left = renderHook(() => useExamSignals({ enabled: true, attemptId: 'a1', currentSlot: 0 }));
    left.unmount();
    expect(sent().map((signal) => signal.type)).toContain('left');

    apiPost.mockClear();
    const submitted = renderHook(() => useExamSignals({ enabled: true, attemptId: 'a2', currentSlot: 0 }));
    act(() => submitted.result.current.stop());
    submitted.unmount();
    expect(sent().map((signal) => signal.type)).not.toContain('left');
  });
});
