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
    const ctx = gsap.context(() => setup({ scope: element, reduced }), element);

    return () => ctx.revert();
    // `setup` is deliberately not a dependency. Callers pass an inline
    // closure, so including it would tear down and rebuild every animation on
    // the page on every render — `deps` is the intended re-run signal, exactly
    // as with `useEffect`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
