import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitChatFrame, emitTyping } from '@/components/notifications/live-bus';
import { usePeerTyping, useTypingSignal } from './use-typing';

const THREAD = 'c-1';

describe('usePeerTyping', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows for the other side of THIS thread, and drops a few seconds after the last frame', () => {
    const { result } = renderHook(() => usePeerTyping(THREAD, 'visitor'));
    act(() => emitTyping('other-thread', 'visitor'));
    act(() => emitTyping(THREAD, 'admin'));
    expect(result.current).toBe(false);

    act(() => emitTyping(THREAD, 'visitor'));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(6_100));
    expect(result.current).toBe(false);
  });

  it('gives way the moment the message itself lands', () => {
    const { result } = renderHook(() => usePeerTyping(THREAD, 'admin'));
    act(() => emitTyping(THREAD, 'admin'));
    expect(result.current).toBe(true);
    act(() => emitChatFrame(THREAD));
    expect(result.current).toBe(false);
  });
});

describe('useTypingSignal', () => {
  it('pings at most once every few seconds, and never for an empty box', () => {
    vi.useFakeTimers();
    const send = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useTypingSignal(send));
    result.current('   ');
    result.current('a');
    result.current('ab');
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3_600);
    result.current('abc');
    expect(send).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
