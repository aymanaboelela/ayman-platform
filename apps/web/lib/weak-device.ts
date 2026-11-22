'use client';

import { useSyncExternalStore } from 'react';

/**
 * "Is this machine too weak for the ambient effects?" — asked in two ways,
 * because neither alone is enough.
 *
 * 1. **What the browser admits before anything runs.** `deviceMemory` (Chrome
 *    only, bucketed to a power of two and capped at 8), `hardwareConcurrency`
 *    (logical cores) and the Save-Data switch. Cheap, synchronous, and it means
 *    a 4 GB dual-core laptop never even downloads the 41 kB fluid shader. But it
 *    is a guess: a quad-thread machine with a decent GPU passes or fails on
 *    cores alone, and Safari/Firefox expose no memory figure at all.
 * 2. **What the frames actually did.** `framesSayTooSlow` below, fed by the
 *    splash cursor's own frame loop. This is the real answer — the effect is
 *    measured on the hardware it is running on — and it is the only one that
 *    catches a strong-looking laptop with a blocklisted or throttled GPU. Its
 *    verdict is remembered so the next page load is decided by (1)-speed
 *    instead of re-paying the jank to measure it again.
 *
 * Asked for by the owner: many students are on weak machines, and there the
 * cursor trail turns every mouse movement into stutter, on every page,
 * including quizzes.
 */

const STORAGE_KEY = 'fx:weak-device';

/**
 * How long a measured "too slow" verdict is trusted. Not forever: the same
 * laptop on battery saver (Chrome throttles rAF to 30 fps) and plugged in are
 * two different machines, and a one-off bad minute — the owner's own Mac with a
 * dozen dev servers open — must not switch the effects off for good.
 */
export const MEASURED_VERDICT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface DeviceHints {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

/** Pure, so the thresholds are unit-tested rather than trusted. */
export function hintsSayWeak(hints: DeviceHints): boolean {
  if (hints.connection?.saveData === true) return true;
  // `<= 4` GB: Chrome rounds DOWN to a power of two, so a 6 GB machine reports
  // 4 and an 8 GB one reports 8 — the line falls between "struggles" and "fine".
  if (typeof hints.deviceMemory === 'number' && hints.deviceMemory > 0 && hints.deviceMemory <= 4) {
    return true;
  }
  // `<= 4` logical cores: dual-core-with-hyperthreading Celerons, i3s and the
  // Intel MacBook Airs, whose integrated GPUs are exactly the ones that drop
  // the fluid simulation to ~20 fps. `0`/missing is "unknown", not "weak".
  if (
    typeof hints.hardwareConcurrency === 'number' &&
    hints.hardwareConcurrency > 0 &&
    hints.hardwareConcurrency <= 4
  ) {
    return true;
  }
  return false;
}

/** The stored value is the epoch-ms the verdict was reached. */
export function storedVerdictIsFresh(raw: string | null, now: number): boolean {
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at) || at <= 0) return false;
  return now - at < MEASURED_VERDICT_TTL_MS && now >= at;
}

/**
 * Median frame interval above ~28 ms (under ~36 fps). The MEDIAN, not the
 * mean: a GC pause or a route's hydration spikes a handful of frames on any
 * machine, and averaging those in would condemn a fast laptop for one hiccup.
 * A weak GPU is slow on most frames, which is what the median sees.
 */
export const SLOW_FRAME_MEDIAN_MS = 28;

export function framesSayTooSlow(intervals: readonly number[]): boolean {
  if (intervals.length === 0) return false;
  const sorted = [...intervals].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return median > SLOW_FRAME_MEDIAN_MS;
}

/* ---- the store ------------------------------------------------------------ */

const listeners = new Set<() => void>();
let cached: boolean | null = null;

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private window / blocked storage: no memory, the hints still decide.
    return null;
  }
}

function getSnapshot(): boolean {
  if (cached === null) {
    cached =
      hintsSayWeak(navigator as Navigator & DeviceHints) ||
      storedVerdictIsFresh(readStored(), Date.now());
  }
  return cached;
}

// "Weak" until hydration, for the same reason `useAmbientEffectsAllowed`
// defaults every gate to "suppress": the effect is absent from the server HTML
// and appears only once the real answer is known.
const getServerSnapshot = () => true;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function useWeakDevice(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Called by an effect that measured itself and found the machine too slow.
 * Every `useAmbientEffectsAllowed` subscriber flips to "off" in the same tick,
 * so the other heavy layers on the page go with it rather than waiting for the
 * next load.
 */
export function markDeviceTooSlow(): void {
  cached = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Not remembered; this page still turns the effects off.
  }
  for (const listener of listeners) listener();
}
