'use client';

import { useLayoutEffect, type DependencyList, type RefObject } from 'react';
import { gsap } from '@/lib/gsap';

export type GsapContext = {
  /** The element `scope` points at. Selector strings resolve inside it. */
  scope: HTMLElement;
  /** True when the user asked for reduced motion. See the contract below. */
  reduced: boolean;
};

/**
 * Runs `setup` inside a `gsap.context()` scoped to `scope`, reverting the whole
 * context on unmount or dependency change.
 *
 * Two reasons this exists rather than a bare `useEffect`:
 *
 * 1. `gsap.context()` records every tween, timeline and ScrollTrigger created
 *    inside it, and `ctx.revert()` kills all of them AND restores inline styles.
 *    Without it a route change leaves orphaned ScrollTriggers bound to detached
 *    nodes, still measuring on every scroll event.
 * 2. Selector strings inside the callback resolve against `scope` only, so two
 *    mounts of the same section never animate each other's elements.
 *
 * ⚠️ That second property cuts both ways: a `trigger: '.some-other-section'`
 * string will be looked up INSIDE the scope and silently resolve to nothing,
 * leaving the ScrollTrigger stuck at an end state. Anything outside the scoped
 * element — a footer, the document — must be passed by element reference, not
 * by selector.
 *
 * ## The reduced-motion contract
 *
 * Entrance animations MUST be written with `gsap.from()` / `fromTo()`, never
 * `gsap.to()` off a CSS start state. That way the element's resting styles are
 * already its final styles, and "reduced motion" is implemented by simply not
 * animating — content is fully visible either way. A `to()` tween off
 * `opacity: 0` in CSS would leave that content permanently invisible for the
 * users who asked for less motion, which is the failure mode this rule exists
 * to prevent.
 *
 * Continuous motion (marquees, drift, parallax) takes the `reduced` flag and
 * returns early.
 *
 * `useLayoutEffect` rather than `useEffect`: `from()` writes the start state
 * synchronously, and running after paint shows one frame of un-animated content.
 * This hook is client-only, so there is no SSR warning to suppress.
 *
 * ## ⚠️ An animation that throws must not take the page with it
 *
 * `from()` renders its first frame synchronously, inside this layout effect, so
 * anything GSAP's CSS parsing trips over — a computed value a browser returns
 * as null, an element an extension has rewritten — throws straight out of the
 * effect and into the route's `error.tsx`. The landing page recorded exactly
 * that: «Cannot read properties of null (reading 'replace')» on `/`, three
 * times, from Windows Chrome, with the whole page replaced by an error screen
 * over a decoration. `components/site/vendor/splash-cursor.tsx` draws the same
 * line for WebGL: the effect is ornament; the page behind it is the product.
 *
 * So `setup` runs inside a `try` INSIDE the context — not around
 * `gsap.context()`, which would leave GSAP's global "current context" pointing
 * at this one after the throw and file every later tween on the page into it —
 * and a failure reverts whatever the setup had already started. Reverting is
 * what makes this safe rather than merely quiet: every entrance here is a
 * `from()`, so the resting state is the finished state, and the content is
 * fully visible with no animation at all (the reduced-motion contract above).
 */
export function useGsap(
  setup: (ctx: GsapContext) => void,
  scope: RefObject<HTMLElement | null>,
  deps: DependencyList = [],
): void {
  useLayoutEffect(() => {
    const element = scope.current;
    if (!element) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let failed = false;
    let cause: unknown;
    const ctx = gsap.context(() => {
      try {
        setup({ scope: element, reduced });
      } catch (error) {
        failed = true;
        cause = error;
      }
    }, element);

    if (failed) {
      // For whoever has devtools open; not a fault to file — the page is fine.
      console.warn('[use-gsap] an animation failed to start and was skipped', cause);
      ctx.revert();
      return;
    }

    return () => ctx.revert();
    // `setup` is deliberately not a dependency. Callers pass an inline
    // closure, so including it would tear down and rebuild every animation on
    // the page on every render — `deps` is the intended re-run signal, exactly
    // as with `useEffect`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
