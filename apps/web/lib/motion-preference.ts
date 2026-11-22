'use client';

import { isFxLite } from '@/lib/weak-device';

/**
 * "Should this play the still version?" for imperative code — a count-up's
 * first line, a carousel's timer, a GSAP entrance.
 *
 * Two different people get the same answer: the visitor who asked the OS for
 * less motion, and the one whose machine cannot carry it (`data-fx="lite"`,
 * `lib/weak-device.ts`). Every effect used to ask only the first question, so a
 * weak laptop ran every count-up, every timeline and every rAF loop while its
 * stylesheet had already gone still — the two halves of the page disagreed.
 *
 * Client only (it reads `window`). Hooks that must re-render when the answer
 * changes use `useFxLite()` / `useAmbientEffectsAllowed()` instead.
 */
export function prefersLessMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches || isFxLite();
}
