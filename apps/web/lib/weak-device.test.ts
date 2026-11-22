import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MEASURED_VERDICT_TTL_MS,
  framesSayTooSlow,
  hintsSayWeak,
  storedVerdictIsFresh,
} from './weak-device';

describe('hintsSayWeak', () => {
  it('passes a normal laptop', () => {
    expect(hintsSayWeak({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(false);
  });

  it('flags 4 GB or less', () => {
    expect(hintsSayWeak({ hardwareConcurrency: 8, deviceMemory: 4 })).toBe(true);
    expect(hintsSayWeak({ hardwareConcurrency: 8, deviceMemory: 2 })).toBe(true);
  });

  it('flags 4 logical cores or fewer', () => {
    expect(hintsSayWeak({ hardwareConcurrency: 4, deviceMemory: 8 })).toBe(true);
    expect(hintsSayWeak({ hardwareConcurrency: 2 })).toBe(true);
  });

  it('flags Save-Data', () => {
    expect(hintsSayWeak({ hardwareConcurrency: 16, deviceMemory: 8, connection: { saveData: true } })).toBe(
      true,
    );
  });

  // Safari and Firefox expose no `deviceMemory`; a missing or zero figure is
  // "unknown", and unknown must not switch the effects off for everyone.
  it('treats missing or zero hints as unknown, not weak', () => {
    expect(hintsSayWeak({})).toBe(false);
    expect(hintsSayWeak({ hardwareConcurrency: 0, deviceMemory: 0 })).toBe(false);
    expect(hintsSayWeak({ hardwareConcurrency: 10 })).toBe(false);
  });
});

describe('storedVerdictIsFresh', () => {
  const now = 1_800_000_000_000;

  it('trusts a recent verdict', () => {
    expect(storedVerdictIsFresh(String(now - 60_000), now)).toBe(true);
  });

  it('forgets it after the TTL', () => {
    expect(storedVerdictIsFresh(String(now - MEASURED_VERDICT_TTL_MS - 1), now)).toBe(false);
  });

  it('ignores garbage and future stamps', () => {
    expect(storedVerdictIsFresh(null, now)).toBe(false);
    expect(storedVerdictIsFresh('yes', now)).toBe(false);
    expect(storedVerdictIsFresh(String(now + 60_000), now)).toBe(false);
  });
});

describe('framesSayTooSlow', () => {
  const frames = (ms: number, n = 90) => Array.from({ length: n }, () => ms);

  it('passes 60 and 120 Hz', () => {
    expect(framesSayTooSlow(frames(16.7))).toBe(false);
    expect(framesSayTooSlow(frames(8.3))).toBe(false);
  });

  it('flags a GPU stuck around 20–30 fps', () => {
    expect(framesSayTooSlow(frames(50))).toBe(true);
    expect(framesSayTooSlow(frames(33.4))).toBe(true);
  });

  // The reason for the median: a fast machine with a few hydration/GC spikes
  // must not be condemned for them.
  it('ignores a minority of long frames', () => {
    const intervals = [...frames(16.7, 80), ...frames(200, 10)];
    expect(framesSayTooSlow(intervals)).toBe(false);
  });

  it('says nothing without samples', () => {
    expect(framesSayTooSlow([])).toBe(false);
  });
});

describe('useWeakDevice + markDeviceTooSlow', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('flips every subscriber to weak and remembers it', async () => {
    vi.stubGlobal('navigator', { ...navigator, hardwareConcurrency: 8, deviceMemory: 8 });
    const mod = await import('./weak-device');
    const { result } = renderHook(() => mod.useWeakDevice());
    expect(result.current).toBe(false);

    act(() => mod.markDeviceTooSlow());

    expect(result.current).toBe(true);
    expect(storedVerdictIsFresh(window.localStorage.getItem('fx:weak-device'), Date.now())).toBe(true);
  });

  it('a fresh stored verdict decides the next load', async () => {
    vi.stubGlobal('navigator', { ...navigator, hardwareConcurrency: 8, deviceMemory: 8 });
    window.localStorage.setItem('fx:weak-device', String(Date.now() - 1000));
    const mod = await import('./weak-device');
    const { result } = renderHook(() => mod.useWeakDevice());
    expect(result.current).toBe(true);
  });
});
