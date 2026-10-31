import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * «الصوت مقفول» has to hold for everything already scheduled. The game hands
 * `show` to timers (the bed 1 s after a question opens, the fanfare after a
 * reveal), and those timers keep the `show` from the render that set them —
 * the one where sound was still on.
 */
class FakeContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => undefined);
}
const stopAll = vi.fn();
vi.mock('./show-score', () => ({
  ShowScore: class {
    stopAll = stopAll;
  },
}));

const { useGameSound } = await import('./use-game-sound');

describe('useGameSound — mute', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('a show() captured before muting does nothing after it, and the context is paused', () => {
    const ctx = new FakeContext();
    vi.stubGlobal('AudioContext', vi.fn(() => ctx));
    const { result } = renderHook(() => useGameSound());
    act(() => result.current.unlock());
    const staleShow = result.current.show;

    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);
    expect(stopAll).toHaveBeenCalled();
    expect(ctx.suspend).toHaveBeenCalled();

    const run = vi.fn();
    staleShow(run);
    expect(run).not.toHaveBeenCalled();
    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it('mutes even when localStorage refuses the write', () => {
    vi.stubGlobal('AudioContext', vi.fn(() => new FakeContext()));
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useGameSound());
    act(() => result.current.unlock());
    // The press is remembered for the page's life, so start from «on» whatever
    // the test before left behind — and every press must still flip it.
    if (!result.current.enabled) act(() => result.current.toggle());
    expect(result.current.enabled).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);
    const run = vi.fn();
    result.current.show(run);
    expect(run).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
