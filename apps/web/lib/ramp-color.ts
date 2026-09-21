import { useSyncExternalStore } from 'react';
import { oklchToRgb } from '@ayman/ui/oklch';
import type { PRIMARY_STEPS } from '@ayman/ui/ramp';
import { IS_AYMAN } from '@/lib/tenant';

/**
 * A `--p-*` ramp step as a concrete `#rrggbb`, for the handful of places that
 * cannot be handed a `var()`.
 *
 * ## Why anything needs this
 *
 * Several places paint with the brand orange through an API that takes a
 * COLOUR VALUE and not a CSS declaration: two WebGL fluids that interpolate
 * between colours inside a shader, `ElectricBorder`, which assigns straight to
 * `ctx.strokeStyle`, and the two `atmosphere/` scenes, which hand a hex to an
 * `ogl` uniform and a three.js material. None of them can resolve a custom
 * property — a canvas context has no cascade to look it up in — so each carried
 * a hardcoded amber literal with a comment explaining why it could not be a
 * token. That reasoning was right and its conclusion was one tenant too narrow:
 * the value has to be CONCRETE, but it does not have to be AMBER.
 *
 * ## Where a second instructor's orange actually lives
 *
 * Not in the environment. `accentHue` is a stored setting
 * (`BrandingSchema.accentHue`), and `renderBrandingStyle` turns it into the
 * eleven `--p-*` declarations it writes into the page's own `<style>` — so by
 * the time anything paints, the tenant's whole ramp is already on
 * `document.documentElement`, computed by the browser, at the exact numbers
 * `primaryRamp()` produced. Reading it back is therefore not a second
 * derivation that could drift from the first; it IS the first, read where it
 * was published.
 *
 * That also rules out re-running `primaryRamp()` here: nothing on the client
 * knows the hue, and the one thing that does know it has already done the work.
 *
 * ## Ayman's stack keeps its literals, and this is measured, not assumed
 *
 * The four literals are NOT ramp steps, whatever their comments say. Converted
 * with `oklchToRgb`, `--p-500` is `#F28318` where the literal is `#F08A2E`, and
 * `--p-600` is `#E35D00` where the literal is `#D25C10` — the same family,
 * around 0.02 of lightness and 0.02 of chroma apart, which is a hand-picked
 * value sitting near a rung rather than on it. Generating from his own hue is
 * further still: `primaryRamp(72)` puts step 500 at `#D29748`, because a single
 * hue at 72 cannot hold the chroma the hand-tuned ramp reaches by drifting to
 * 56 and 48 at the middle steps.
 *
 * So there is no derivation that reproduces what is on his site today, and the
 * brief is that his site does not change. `IS_AYMAN` keeps the literal for him
 * and derives for everybody else, which is also the fail-closed direction: a
 * stack this cannot classify keeps the amber it already had, and amber on a
 * page whose ramp is amber is right rather than merely harmless.
 *
 * ⚠️ This used to carry a warning that `IS_AYMAN` resolves to `true` in the
 * browser on every stack, because `process.env.TENANT_KEY` is not inlined into
 * client bundles. That line exists now — `next.config.ts` lists `TENANT_KEY`
 * and `TENANT_DISPLAY_NAME` under `env`, which Next inlines at BUILD time — so
 * the derivation does run in the browser and a tenant's flourishes follow
 * their ramp. Do not reason from the old note.
 *
 * What still holds: the value is baked per image, so changing `TENANT_KEY` in
 * a running container changes nothing until it is rebuilt.
 */

/** One rung of the `--p-*` ramp, named the way `tokens/color.css` names it. */
export type PrimaryStep = (typeof PRIMARY_STEPS)[number];

/**
 * `oklch(L C H)` as the ramp writes it — three decimals and whole degrees, from
 * `formatOklch` for a generated ramp and by hand in `tokens/color.css` for the
 * shipped one. Anything else is not something this understands, and the caller
 * gets its own value back rather than a guess.
 */
const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/;

/**
 * Resolved values, keyed by step.
 *
 * The ramp is written into the document by the server render and nothing on the
 * client ever rewrites it, so this is read once per step for the life of the
 * page. Worth caching for more than the arithmetic: `getComputedStyle` is a
 * layout read, and these are called from render paths that run on every frame's
 * worth of state change.
 */
const resolved = new Map<PrimaryStep, string>();

/**
 * The tenant's `--p-{step}` as `#rrggbb`, or `ayman` on his stack and anywhere
 * the token cannot be read — during the server render, where there is no
 * document, and on any value this does not recognise.
 */
export function rampHex(step: PrimaryStep, ayman: string): string {
  if (IS_AYMAN) return ayman;
  if (typeof document === 'undefined') return ayman;

  const cached = resolved.get(step);
  if (cached !== undefined) return cached;

  const declared = getComputedStyle(document.documentElement)
    .getPropertyValue(`--p-${step}`)
    .trim();
  const parts = OKLCH.exec(declared);
  if (!parts) return ayman;

  const { r, g, b } = oklchToRgb({
    l: Number(parts[1]),
    c: Number(parts[2]),
    h: Number(parts[3]),
  });
  const channel = (value: number) =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  const hex = `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();

  resolved.set(step, hex);
  return hex;
}

/**
 * Nothing to subscribe to: the ramp is written once by the server render and
 * never rewritten, so the store below has exactly one transition — the one from
 * the server's answer to the client's, which React performs on its own after
 * hydrating. Module-level so the identity is stable and nothing re-subscribes.
 */
const neverChanges = () => () => {};

/**
 * `rampHex` for a value that ends up in SERVER-RENDERED MARKUP.
 *
 * ⚠️ The difference from calling `rampHex` directly is hydration, and it is not
 * cosmetic. `<ElectricCard>` writes its colour into a `style` attribute as
 * `--electric-card-fallback-color`, and that attribute is in the prerendered
 * HTML — so a value the server computes as Ayman's literal (it has no document
 * to read a ramp off) and the client computes as the tenant's is exactly the
 * pair React compares, and mismatches on, during hydration.
 *
 * `useSyncExternalStore` is the one hook built for that shape: the server
 * snapshot is ALSO what the hydrating render uses, so the first client render
 * agrees with the HTML by construction, and the real value arrives in the
 * ordinary re-render afterwards. On Ayman's stack both snapshots are the same
 * string and React bails out, so his page never even re-renders.
 */
export function useRampHex(step: PrimaryStep, ayman: string): string {
  return useSyncExternalStore(
    neverChanges,
    () => rampHex(step, ayman),
    () => ayman,
  );
}
