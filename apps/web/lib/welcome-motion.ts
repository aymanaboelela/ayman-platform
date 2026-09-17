import type { CSSProperties } from 'react';

/**
 * The numbers behind /welcome's arrival and its departure.
 *
 * ## Why they are here and not in the component
 *
 * Two of the three things that read them are Server Components — the page
 * itself and its step rail — and this file is imported by both. A `'use
 * client'` module cannot supply them: a plain function exported from one
 * throws at request time the moment a Server Component calls it, which
 * typechecks clean, unit-tests clean, and 500s the route. So the ladder lives
 * in a plain lib module and the one client component reads it from here like
 * everybody else.
 *
 * ## Why they are numbers at all, when the animation is CSS
 *
 * The entrance IS CSS — keyframes in `study.css`, no JavaScript, running on
 * the first painted frame with nothing to hydrate first. What TypeScript owns
 * is only WHEN each element starts, written onto it as `--welcome-delay`,
 * because a stagger expressed as six hand-written `animation-delay` rules is
 * six numbers nobody can see the shape of. Here they are one table you can
 * read top to bottom in the order the screen reads.
 *
 * The durations that CSS alone needs (the rise, the tick, the handoff) are
 * declared as custom properties in `study.css` AND restated here, because the
 * handoff timer is a `setTimeout` and it has to agree with the animation it is
 * waiting for. `welcome-motion.test.ts` reads both files and fails if the two
 * copies drift — which is the only reason it is safe to have two.
 */

/** How long one element's entrance runs, once its delay is up. */
export const WELCOME_ENTRANCE_DURATION_MS = 360;

/**
 * The gap between consecutive stops on the step rail.
 *
 * Shorter than the gap between the blocks above it (50ms vs 60ms) on purpose:
 * the three stops are ONE object arriving, not three, and a rail that ticks
 * over at the same pace as the page reads as a list being assembled in front
 * of the student rather than as a single figure landing.
 */
export const WELCOME_STEP_STRIDE_MS = 45;

/** After a step lands, how long before its mark pops. Mirrors `--welcome-tick-delay`. */
export const WELCOME_TICK_DELAY_MS = 140;

/** How long the mark's pop runs. Mirrors `--welcome-tick-pop`. */
export const WELCOME_TICK_DURATION_MS = 320;

/** After the mark pops, how long before the check starts drawing. Mirrors `--welcome-tick-draw-delay`. */
export const WELCOME_TICK_DRAW_DELAY_MS = 120;

/** How long the check takes to draw itself. Mirrors `--welcome-tick-draw`. */
export const WELCOME_TICK_DRAW_DURATION_MS = 300;

/**
 * The departure: how long «يلا نبدأ» is allowed to hold the student before the
 * router is asked to move.
 *
 * 260ms, and every part of that number is argued:
 *
 *   · It is the same 220ms the incoming page spends fading in (`.route-fade`
 *     in globals.css) plus the 40ms the third step needs to finish ticking. The
 *     scene leaves in exactly the time the next one takes to arrive, so the two
 *     read as one movement instead of as a stall followed by a page.
 *   · It is under the 400ms this product's `ayman/no-layout-animation` rule
 *     calls the point where a transition stops reading as motion and starts
 *     reading as lag.
 *   · `<Link>` has already prefetched the destination by the time anyone
 *     presses, so this is not 260ms added to a wait — it is 260ms spent while
 *     the router would have been working anyway.
 *
 * Mirrors `--welcome-handoff`.
 */
export const WELCOME_HANDOFF_MS = 260;

/**
 * The ceiling the whole entrance has to finish under.
 *
 * «This is the screen between a form and the product, not a title sequence.»
 * A student arriving here has just filled in an account form and wants the
 * product; anything that makes them WAIT to be congratulated has inverted the
 * point of congratulating them. The test asserts the longest chain on the
 * screen — the second tick, which is the last thing to move — lands inside it.
 */
export const WELCOME_ENTRANCE_BUDGET_MS = 1000;

/**
 * When each block of the screen starts, in milliseconds after first paint.
 *
 * Read it in order and it is the sentence the screen says: «آخر خطوة» → «أهلاً
 * يا فلان» → «حسابك جاهز» → the rail that proves it → the one ask → the way
 * out. Nothing here is a round number pulled out of the air; the 60ms stride
 * is short enough that the six blocks read as one gesture and long enough that
 * the eye can tell they are in an order.
 *
 * `cta` is last and that is deliberate — but see `.welcome-cta` in study.css
 * for the invariant that makes it safe: the CTA is the one element on this
 * screen whose entrance never touches opacity. It is fully painted, fully
 * hit-testable and fully pressable on the first frame; all its delay buys is
 * a 10px rise it performs while already being pressable.
 */
export const WELCOME_ENTRANCE_MS = {
  eyebrow: 0,
  title: 60,
  body: 120,
  /** The first stop; the rest follow at `WELCOME_STEP_STRIDE_MS`. */
  steps: 170,
  card: 310,
  cta: 360,
} as const;

export type WelcomeSlot = keyof typeof WELCOME_ENTRANCE_MS;

/**
 * The inline style that puts one element on the ladder.
 *
 * A custom property rather than a class per slot: `.welcome-in` is one rule
 * that every entering element shares, and the only thing that differs between
 * them is a number. Six classes carrying six `animation-delay` values would be
 * the same information spread across two files.
 *
 * ⚠️ `--welcome-delay` is also read by the step marks, via
 * `calc(var(--welcome-delay) + var(--welcome-tick-delay))`. Setting it on the
 * `<li>` is what lets the tick chase its own row without a second property.
 */
export function entranceDelay(ms: number): CSSProperties {
  return { '--welcome-delay': `${ms}ms` } as CSSProperties;
}

/** Where the `index`-th stop on the rail starts. */
export function stepDelayMs(index: number): number {
  return WELCOME_ENTRANCE_MS.steps + index * WELCOME_STEP_STRIDE_MS;
}

/**
 * The moment the screen stops moving, for the `index`-th stop's tick.
 *
 * The last thing to finish on this screen is not the CTA — it is the SECOND
 * tick finishing its draw, because the mark waits for its row and the check
 * waits for the mark. Anything checking the entrance budget has to check this
 * chain, not the table above it.
 */
export function stepTickEndsMs(index: number): number {
  return (
    stepDelayMs(index) +
    WELCOME_TICK_DELAY_MS +
    WELCOME_TICK_DRAW_DELAY_MS +
    WELCOME_TICK_DRAW_DURATION_MS
  );
}

/** The last frame of the whole entrance — every block and every tick considered. */
export function entranceEndsMs(doneStepCount: number): number {
  const blocks = Object.values(WELCOME_ENTRANCE_MS).map(
    (delay) => delay + WELCOME_ENTRANCE_DURATION_MS,
  );
  const ticks = Array.from({ length: doneStepCount }, (_, i) => stepTickEndsMs(i));
  return Math.max(...blocks, ...ticks);
}

/**
 * The shape of a press, structurally — not React's `MouseEvent`.
 *
 * So this can be tested without a DOM and without React, and so the one rule
 * that matters here is written once in a place a test can reach it.
 */
export type PressLike = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
};

/**
 * Whether this press is ours to hold for the departure animation, or the
 * browser's to handle as it always would.
 *
 * «يلا نبدأ» is a real `<Link>` and the page docblock explains at length why it
 * must stay one: middle-click, ⌘-click, open-in-new-tab and the status-bar
 * preview are all things a `<button>` throws away. Intercepting the press to
 * play an animation throws away exactly the same things unless the intercept
 * knows when to stand down — so it does:
 *
 *   · `button !== 0` — middle-click (button 1) opens a new tab, right-click
 *     (2) opens the menu. Neither is a departure from THIS scene, so neither
 *     gets one.
 *   · any modifier — ⌘/ctrl opens a background tab, shift a window, alt
 *     downloads. All of them leave this page exactly where it is, and fading
 *     it out under a student who asked for a second tab is a bug.
 *   · already prevented — something upstream has claimed this press. It is not
 *     ours to schedule a navigation for.
 *
 * Everything else is a plain press: the student is leaving, and the scene gets
 * to say goodbye first.
 */
export function isPlainPress(press: PressLike): boolean {
  if (press.defaultPrevented) return false;
  if (press.button !== 0) return false;
  return !(press.metaKey || press.ctrlKey || press.shiftKey || press.altKey);
}

/**
 * How long to hold before navigating.
 *
 * Zero under reduced motion, and that is the whole branch: a student who has
 * asked their operating system for less movement is not shown a departure, so
 * there is nothing to wait for, so waiting would be pure latency charged to
 * the one person on the platform who explicitly opted out of the reason for
 * it. The press navigates on the same tick the browser would have.
 */
export function handoffDelayMs(prefersReducedMotion: boolean): number {
  return prefersReducedMotion ? 0 : WELCOME_HANDOFF_MS;
}
