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
  return target as unknown as TargetAndTransition;
}

/**
 * Takes a whole `VariantSet` (an interface with fixed `initial`/`animate`/
 * `exit` keys, not an index-signature type), so the parameter is typed as
 * `object` rather than `Record<string, unknown>` — an interface is not
 * structurally assignable to `Record<string, unknown>` without one.
 */
export function asMotionVariants(variants: object): Variants {
  return variants as unknown as Variants;
}
