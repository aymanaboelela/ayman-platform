/**
 * Motion variants as plain data.
 *
 * This module deliberately does NOT import `motion`. The design-system package
 * stays dependency-free, and — more importantly — these numbers are unit-tested
 * against the CSS custom properties in `tokens/tokens.ts`, so a transition
 * written in CSS and an animation written in Motion can never drift apart.
 *
 * Consumers spread these into `m.*` components:
 *   <m.div variants={popover} initial="initial" animate="animate" exit="exit" />
 * or use the states directly:
 *   <m.div initial={popover.initial} animate={popover.animate} />
 */

/** Motion's `BezierDefinition`. Mutable on purpose — Motion's types reject readonly tuples. */
export type Bezier = [number, number, number, number];

export const EASE: Bezier = [0.25, 0.1, 0.25, 1];
/** DEFAULT for anything entering or exiting. */
export const EASE_OUT: Bezier = [0.3, 0.8, 0.6, 1];
/** Anything moving or morphing in place. */
export const EASE_IN_OUT: Bezier = [0.6, 0, 0.2, 1];
/** Popovers and menus. The trailing 1.1 is a deliberate slight overshoot. */
export const EASE_POP: Bezier = [0.175, 0.885, 0.32, 1.1];

/** Motion works in seconds; `tokens.motion.duration` is in milliseconds. */
export const SECONDS = {
  hover: 0.16,
  popover: 0.2,
  modal: 0.3,
  exit: 0.12,
} as const;

export interface VariantSet {
  initial: Record<string, unknown>;
  animate: Record<string, unknown>;
  exit?: Record<string, unknown>;
}

/**
 * Popovers, menus, dropdowns, tooltips.
 * scale(0.96) + opacity is the highest-ROI motion detail in the whole design system.
 */
export const popover: VariantSet = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: { duration: SECONDS.popover, ease: EASE_POP } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: SECONDS.exit, ease: EASE_OUT } },
};

/** Dialogs and sheets. Slightly longer in, same fast out. */
export const modal: VariantSet = {
  initial: { opacity: 0, scale: 0.98, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: SECONDS.modal, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: SECONDS.exit, ease: EASE_OUT } },
};

/** Below-the-fold content entering on scroll. Safe to fade — it is never the LCP element. */
export const fadeUp: VariantSet = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: SECONDS.modal, ease: EASE_OUT } },
};

/**
 * ABOVE-THE-FOLD ONLY. No `opacity` key anywhere, by design.
 *
 * Motion server-renders `initial` into the HTML's inline style. An `opacity: 0`
 * initial state therefore ships invisible text to the browser: crawlable, but
 * not painted until hydration finishes — which is a direct LCP regression on the
 * one element whose paint time is being measured. Translate only.
 */
export const heroLcpSafe: VariantSet = {
  initial: { y: 14 },
  animate: { y: 0, transition: { duration: SECONDS.modal, ease: EASE_OUT } },
};

/** The parent of the ONE orchestrated scroll moment a page is allowed. */
export const staggerParent: VariantSet = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

export const staggerChild: VariantSet = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: SECONDS.hover, ease: EASE_OUT } },
};
