import type { TargetAndTransition, Variants } from 'motion/react';

/**
 * `@ayman/ui`'s motion variants are plain `Record<string, unknown>` data —
 * `packages/ui/src/motion/variants.ts` deliberately takes no `motion`
 * dependency so those numbers can be unit-tested against the CSS tokens they
 * must match (see that file's own comment). Motion's own types are stricter
 * than a bare index signature (they special-case CSS custom property keys),
 * so a `Record<string, unknown>` cannot be *assigned* to `TargetAndTransition`
 * directly — only asserted. This is the one, narrow place that assertion
 * happens, so every consumer passes `motionPresets.*` straight into
 * `initial`/`animate`/`exit`/`variants` without repeating the cast.
 */
export function asMotionTarget(target: Record<string, unknown>): TargetAndTransition {
  return target as TargetAndTransition;
}

export function asMotionVariants(variants: Record<string, unknown>): Variants {
  return variants as Variants;
}
