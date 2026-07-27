import type { AccentSlot, RadiusSlot } from '@ayman/contracts/admin/settings';

/** The four accent steps: 9 solid, 10 solid-hover, 11 low-contrast text, 12 high-contrast. */
export type AccentRamp = readonly [string, string, string, string];

/**
 * The entire colour surface an editor can reach. Values are OKLCH triples
 * measured against the same lightness/chroma discipline as the shipped amber:
 * step 9 is the solid fill, 11 is the text-on-background step, and the dark
 * variants sit slightly lighter and less chromatic so they hold contrast on
 * #08090A without glowing.
 *
 * Green and red are absent by design — they are load-bearing for quiz
 * correctness and can never be brand colours.
 *
 * ⚠️ The amber entry MUST stay byte-identical to `--a-9…--a-12` in
 * `../tokens/color.css`, in both themes. It is the default, so it renders as a
 * no-op override; a drift here means the very first paint of an unbranded
 * install shifts colour for no reason.
 */
export const ACCENT_RAMPS: Record<AccentSlot, { light: AccentRamp; dark: AccentRamp }> = {
  amber: {
    light: [
      'oklch(0.770 0.152 72)',
      'oklch(0.725 0.155 68)',
      'oklch(0.520 0.120 62)',
      'oklch(0.300 0.060 60)',
    ],
    dark: [
      'oklch(0.780 0.150 74)',
      'oklch(0.820 0.150 76)',
      'oklch(0.845 0.130 78)',
      'oklch(0.920 0.090 80)',
    ],
  },
  cyan: {
    light: [
      'oklch(0.720 0.110 205)',
      'oklch(0.675 0.115 203)',
      'oklch(0.500 0.090 200)',
      'oklch(0.295 0.045 200)',
    ],
    dark: [
      'oklch(0.760 0.105 205)',
      'oklch(0.800 0.105 207)',
      'oklch(0.840 0.090 209)',
      'oklch(0.920 0.060 211)',
    ],
  },
  blue: {
    light: [
      'oklch(0.620 0.170 258)',
      'oklch(0.575 0.175 257)',
      'oklch(0.470 0.140 256)',
      'oklch(0.290 0.070 258)',
    ],
    dark: [
      'oklch(0.680 0.155 258)',
      'oklch(0.725 0.150 259)',
      'oklch(0.800 0.115 260)',
      'oklch(0.910 0.060 261)',
    ],
  },
  violet: {
    light: [
      'oklch(0.600 0.170 300)',
      'oklch(0.555 0.175 299)',
      'oklch(0.460 0.140 298)',
      'oklch(0.285 0.075 300)',
    ],
    dark: [
      'oklch(0.670 0.155 300)',
      'oklch(0.715 0.150 301)',
      'oklch(0.795 0.115 302)',
      'oklch(0.910 0.060 303)',
    ],
  },
  magenta: {
    light: [
      'oklch(0.640 0.170 340)',
      'oklch(0.595 0.175 339)',
      'oklch(0.490 0.140 338)',
      'oklch(0.295 0.075 340)',
    ],
    dark: [
      'oklch(0.700 0.150 340)',
      'oklch(0.745 0.145 341)',
      'oklch(0.815 0.110 342)',
      'oklch(0.915 0.058 343)',
    ],
  },
  slate: {
    light: [
      'oklch(0.560 0.020 250)',
      'oklch(0.515 0.022 250)',
      'oklch(0.430 0.020 250)',
      'oklch(0.265 0.014 250)',
    ],
    dark: [
      'oklch(0.650 0.020 250)',
      'oklch(0.700 0.020 250)',
      'oklch(0.790 0.016 250)',
      'oklch(0.910 0.010 250)',
    ],
  },
};

/**
 * Radius presets, in px. `lg` is the CARD radius and the spec's hard ceiling is
 * 8px — `soft` therefore tops out at 8 rather than continuing the ramp. The
 * test asserts this, so a future preset cannot quietly break it.
 */
export const RADIUS_RAMPS: Record<RadiusSlot, { xs: number; sm: number; md: number; lg: number }> = {
  sharp: { xs: 0, sm: 2, md: 3, lg: 4 },
  default: { xs: 3, sm: 4, md: 6, lg: 8 },
  soft: { xs: 4, sm: 6, md: 8, lg: 8 },
};

/**
 * A12: the renderer asserts its OWN output. Values come from the tables above,
 * so this can only fire if someone adds a ramp entry containing something other
 * than a colour function — which is exactly the mistake worth catching, because
 * this string is injected with `dangerouslySetInnerHTML`.
 *
 * The CSP is NOT the control here: an inline `<style>` needs
 * `style-src 'unsafe-inline'`, which Next already requires for its own
 * streaming style injection. The control is that the string is generated from a
 * closed table and validated by this regex before it is emitted.
 */
const SAFE_DECLARATION = /^--[a-z0-9-]+:[a-z0-9(). ,%/#-]+$/;

function declarations(pairs: ReadonlyArray<readonly [string, string]>): string {
  return pairs
    .map(([property, value]) => {
      const declaration = `${property}:${value}`;
      if (!SAFE_DECLARATION.test(declaration)) {
        throw new Error(`unsafe branding declaration: ${declaration}`);
      }
      return declaration;
    })
    .join(';');
}

/**
 * Produces the inline stylesheet injected into `<head>` by the root layout.
 * Rendering it server-side from a cached loader means no FOUC and no build
 * step — the alternative (a per-brand compiled stylesheet) needs a deploy for
 * every colour change, which defeats the point of an admin-controlled brand.
 *
 * ── Three rules, and the selectors are load-bearing ──────────────────────
 *
 * `color.css` declares the dark accent TWICE: under
 * `@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]) }` for
 * a visitor who never touched the toggle, and under `:root[data-theme="dark"]`
 * for one who did. `THEME_SCRIPT` only stamps `data-theme` when a choice was
 * SAVED, so a system-dark first-time visitor has no attribute at all.
 *
 * A naive override of just `:root` and `:root[data-theme="dark"]` therefore
 * loses to `:root:not([data-theme="light"])` (specificity 0-2-0 vs 0-1-0) for
 * exactly that visitor — the one most likely to be on the site at night — who
 * would see the shipped amber instead of the configured brand.
 *
 * So each rule doubles `:root` to sit one class-level above its `color.css`
 * counterpart. That makes the override independent of source order, which
 * matters because React hoists `<style>` elements and gives no guarantee about
 * where they land relative to the framework's own stylesheet links.
 *
 * The dark rules carry the accent ramp only, not the radius: radius is
 * theme-independent and re-declaring it per theme would make a radius change
 * silently theme-dependent.
 */
export function renderBrandingStyle(branding: { accent: AccentSlot; radius: RadiusSlot }): string {
  const accent = ACCENT_RAMPS[branding.accent] as
    | { light: AccentRamp; dark: AccentRamp }
    | undefined;
  const radius = RADIUS_RAMPS[branding.radius] as
    | { xs: number; sm: number; md: number; lg: number }
    | undefined;

  if (!accent) throw new Error(`unknown accent slot: ${String(branding.accent)}`);
  if (!radius) throw new Error(`unknown radius slot: ${String(branding.radius)}`);

  const radiusPairs: ReadonlyArray<readonly [string, string]> = [
    ['--r-xs', `${radius.xs}px`],
    ['--r-sm', `${radius.sm}px`],
    ['--r-md', `${radius.md}px`],
    ['--r-lg', `${radius.lg}px`],
  ];

  const ramp = (values: AccentRamp): ReadonlyArray<readonly [string, string]> => [
    ['--a-9', values[0]],
    ['--a-10', values[1]],
    ['--a-11', values[2]],
    ['--a-12', values[3]],
  ];

  const light = declarations([...ramp(accent.light), ...radiusPairs]);
  const dark = declarations(ramp(accent.dark));

  return (
    `:root:root{${light}}` +
    `@media (prefers-color-scheme:dark){:root:root:not([data-theme="light"]){${dark}}}` +
    `:root:root[data-theme="dark"]{${dark}}`
  );
}

/**
 * Media URLs are reconstructed from the storage key at render time, never
 * stored. `NEXT_PUBLIC_MEDIA_ORIGIN` is a DIFFERENT origin from the app on
 * purpose (A10): a same-origin HTML upload is same-origin XSS regardless of
 * CSP. In dev that is the api port, which is a different origin under the
 * same-origin policy.
 */
export function mediaUrl(storageKey: string): string {
  const origin = process.env.NEXT_PUBLIC_MEDIA_ORIGIN ?? 'http://localhost:3300';
  return `${origin}/media/${storageKey}`;
}
