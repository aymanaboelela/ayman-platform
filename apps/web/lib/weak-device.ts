'use client';

import { useSyncExternalStore } from 'react';
import {
  FX_MODE_KEY,
  FX_VERDICT_KEY,
  FX_VERDICT_TTL_MS,
  FX_WEAK_CORES,
  FX_WEAK_MEMORY_GB,
} from '@/lib/security/prepaint-script';

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
 *
 * ## 3. And what the visitor said — which beats both
 *
 * Hints guess and the watchdog can only judge what it measured, so either can
 * be wrong about one particular machine: a weak laptop whose figures look fine,
 * or the owner's own Mac caught in one bad minute. `fx:mode` (`lite` | `full`)
 * is the visitor's own answer, written by `<FxToggle>`, and once it exists no
 * hint or measurement overrides it.
 *
 * ## One decision, three readers
 *
 * `decideLite()` is the whole rule. The prepaint script runs the same rule
 * before first paint and writes `data-fx="lite"` on `<html>`, which is what the
 * stylesheet's lite backstop (`packages/ui/src/tokens/motion.css`) reads; the
 * hooks below drive the JS effects; `isFxLite()` answers imperative code. Every
 * change (`setFxMode`, `markDeviceTooSlow`) updates all three in the same tick.
 */

const STORAGE_KEY = FX_VERDICT_KEY;

/**
 * How long a measured "too slow" verdict is trusted. Not forever: the same
 * laptop on battery saver (Chrome throttles rAF to 30 fps) and plugged in are
 * two different machines, and a one-off bad minute — the owner's own Mac with a
 * dozen dev servers open — must not switch the effects off for good.
 */
export const MEASURED_VERDICT_TTL_MS = FX_VERDICT_TTL_MS;

/** The visitor's explicit choice. `null` = never chosen, the machine decides. */
export type FxMode = 'lite' | 'full';

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
  if (
    typeof hints.deviceMemory === 'number' &&
    hints.deviceMemory > 0 &&
    hints.deviceMemory <= FX_WEAK_MEMORY_GB
  ) {
    return true;
  }
  // `<= 4` logical cores: dual-core-with-hyperthreading Celerons, i3s and the
  // Intel MacBook Airs, whose integrated GPUs are exactly the ones that drop
  // the fluid simulation to ~20 fps. `0`/missing is "unknown", not "weak".
  if (
    typeof hints.hardwareConcurrency === 'number' &&
    hints.hardwareConcurrency > 0 &&
    hints.hardwareConcurrency <= FX_WEAK_CORES
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

export function parseFxMode(raw: string | null): FxMode | null {
  return raw === 'lite' || raw === 'full' ? raw : null;
}

/**
 * THE rule. `FX_MODE` in the prepaint script runs the same one, in the same
 * order (tested against this): the visitor's choice, else the hints, else a
 * fresh measured verdict.
 */
export function decideLite(input: {
  mode: FxMode | null;
  hints: DeviceHints;
  verdict: string | null;
  now: number;
}): boolean {
  if (input.mode === 'lite') return true;
  if (input.mode === 'full') return false;
  return hintsSayWeak(input.hints) || storedVerdictIsFresh(input.verdict, input.now);
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

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private window / blocked storage: no memory, the hints still decide.
    return null;
  }
}

function writeKey(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembered; this page still follows the change.
  }
}

/** Keeps the stylesheet's view (`data-fx` on `<html>`) in step with the store. */
function applyAttribute(lite: boolean): void {
  if (lite) document.documentElement.setAttribute('data-fx', 'lite');
  else document.documentElement.removeAttribute('data-fx');
}

function compute(): boolean {
  return decideLite({
    mode: parseFxMode(readKey(FX_MODE_KEY)),
    hints: navigator as Navigator & DeviceHints,
    verdict: readKey(STORAGE_KEY),
    now: Date.now(),
  });
}

function getSnapshot(): boolean {
  if (cached === null) cached = compute();
  return cached;
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** A change made in another tab (the toggle, or a verdict) lands here too. */
function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== FX_MODE_KEY && event.key !== STORAGE_KEY) return;
  cached = compute();
  applyAttribute(cached);
  notify();
}

function subscribe(onChange: () => void) {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

// "Weak" until hydration, for the same reason `useAmbientEffectsAllowed`
// defaults every gate to "suppress": the effect is absent from the server HTML
// and appears only once the real answer is known.
const suppressOnServer = () => true;

/** For gating an EFFECT: reports "weak" during SSR and hydration. */
export function useWeakDevice(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, suppressOnServer);
}

// The opposite default, for things that change what a normal machine RENDERS
// (the motion config, the toggle's state): the server HTML is the full-effects
// page, and a lite machine switches after hydration — while its stylesheet has
// already been lite since first paint, from the prepaint script.
const fullOnServer = () => false;

/** For changing behaviour or labels: reports "full" during SSR and hydration. */
export function useFxLite(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, fullOnServer);
}

/** The visitor's explicit choice, or `null` if they never made one. Client only. */
export function readFxMode(): FxMode | null {
  return parseFxMode(readKey(FX_MODE_KEY));
}

/** For imperative code (an effect's first line, a scroll call). Client only. */
export function isFxLite(): boolean {
  return getSnapshot();
}

/**
 * The visitor's own choice, from `<FxToggle>`. Permanent until changed again —
 * and it also clears a measured verdict when they ask for FULL, so taking the
 * effects back is not undone a week later by a stale measurement.
 */
export function setFxMode(mode: FxMode): void {
  writeKey(FX_MODE_KEY, mode);
  if (mode === 'full') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
  }
  cached = mode === 'lite';
  applyAttribute(cached);
  notify();
}

/**
 * Called by an effect that measured itself and found the machine too slow.
 * Every subscriber flips to "lite" in the same tick, so the other heavy layers
 * on the page go with it rather than waiting for the next load.
 *
 * A visitor who chose FULL has overruled the measurement in advance: nothing
 * changes and nothing is stored.
 */
export function markDeviceTooSlow(): void {
  if (readFxMode() === 'full') return;
  cached = true;
  writeKey(STORAGE_KEY, String(Date.now()));
  applyAttribute(true);
  notify();
}
