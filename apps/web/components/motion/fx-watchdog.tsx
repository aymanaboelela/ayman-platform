'use client';

import { useEffect } from 'react';
import { createFrameSampler } from '@/lib/frame-sampler';
import { isFxLite, markDeviceTooSlow, readFxMode } from '@/lib/weak-device';

/**
 * Measures the page's own frame rate a few times per visit and switches the
 * whole platform to lite mode when the machine cannot keep up.
 *
 * ## Why one more watchdog, when the splash cursor already has one
 *
 * That one only exists where the splash cursor does: a wide, fine-pointer
 * screen on a marketing page. The student shell, the lesson page, a quiz, a
 * phone — none of them ever measured anything, so a weak machine whose hints
 * looked fine (8 threads, 8 GB, a GPU from 2014) ran every loop and blur for
 * as long as it was open. Hints are a guess; this is the measurement, taken on
 * every surface (it is mounted once, in the root layout).
 *
 * ## When it measures
 *
 * Not continuously: an empty `requestAnimationFrame` loop that never stops
 * keeps the frame pipeline awake for the life of the tab, which is its own
 * cost on exactly these machines. Instead, a short window (~2 s at 60 fps):
 *
 * - once shortly after load, when the page's entrance and ambient effects are
 *   all running, and
 * - when the visitor starts scrolling — which is when the heavy sections (the
 *   `#years` stage, the scroll-driven reveals) actually cost something —
 *   at most `MAX_WINDOWS` times per page load, `COOLDOWN_MS` apart.
 *
 * A "slow" verdict calls `markDeviceTooSlow()`, which flips `data-fx` and every
 * hook in the same tick and remembers it for seven days. Nothing runs at all
 * once the page is already lite, or when the visitor has chosen FULL — their
 * choice is final (`lib/weak-device.ts`).
 */
const FIRST_WINDOW_DELAY_MS = 1500;
const COOLDOWN_MS = 10_000;
const MAX_WINDOWS = 4;

export function FxWatchdog() {
  useEffect(() => {
    if (readFxMode() !== null || isFxLite()) return;

    let frame = 0;
    let windows = 0;
    let lastWindowAt = -Infinity;
    let stopped = false;

    function stop() {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      window.removeEventListener('scroll', onScroll);
    }

    function startWindow() {
      if (stopped || frame || windows >= MAX_WINDOWS) return;
      if (performance.now() - lastWindowAt < COOLDOWN_MS) return;
      if (readFxMode() !== null || isFxLite()) {
        stop();
        return;
      }
      windows += 1;
      lastWindowAt = performance.now();
      const push = createFrameSampler();
      const tick = (now: number) => {
        const verdict = push(now, document.visibilityState === 'visible');
        if (verdict === 'pending') {
          frame = requestAnimationFrame(tick);
          return;
        }
        frame = 0;
        if (verdict === 'slow') {
          markDeviceTooSlow();
          stop();
        } else if (windows >= MAX_WINDOWS) {
          stop();
        }
      };
      frame = requestAnimationFrame(tick);
    }

    function onScroll() {
      startWindow();
    }

    const first = window.setTimeout(startWindow, FIRST_WINDOW_DELAY_MS);
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.clearTimeout(first);
      stop();
    };
  }, []);

  return null;
}
