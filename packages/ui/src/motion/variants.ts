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

/**
 * The transition half of a variant. Structurally Motion's `Transition`, without
 * importing it — see this file's header for why the package stays free of a
 * `motion` dependency.
 */
export type MotionTransition = {
  duration?: number;
  delay?: number;
  ease?: Bezier;
  staggerChildren?: number;
  delayChildren?: number;
};

/**
 * A variant's target state.
 *
 * ⚠️ These keys are an ALLOWLIST, not a convenience. Only composited
 * properties appear here, so a preset that animates `width`, `top` or `filter`
 * fails to compile — the same rule `ayman/no-layout-animation` enforces on
 * inline props, reaching the one place inline props do not: the shared presets
 * every consumer spreads.
 *
 * ⚠️ A type ALIAS, not an interface, and that is load-bearing rather than
 * stylistic. TypeScript gives an object type alias an implicit index signature
 * and an interface none; Motion's `Target` is an intersection including
 * `VariableKeyframesDefinition` (`{ [key: \`--${string}\`]: … }`), so an
 * interface — however correct its keys — is not assignable to it and every
 * `initial={popover.initial}` fails to compile.
 *
 * This was `Record<string, unknown>` until المساعد's panel became the first
 * component to actually spread a preset, and did not build. The presets were
 * unit-tested and unusable.
 */
export type MotionTarget = {
  opacity?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  x?: number | string;
  y?: number | string;
  rotate?: number;
  transition?: MotionTransition;
};

export interface VariantSet {
  initial: MotionTarget;
  animate: MotionTarget;
  exit?: MotionTarget;
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
