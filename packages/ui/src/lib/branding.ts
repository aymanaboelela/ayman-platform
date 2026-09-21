import type { AccentSlot, RadiusSlot } from '@ayman/contracts/admin/settings';
import {
  emberDeclarations,
  literalDeclarations,
  primaryDeclarations,
  rampDeclarations,
} from './ramp';

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
 * What each slot means to the parts of the scheme a slot could never reach.
 *
 * ## The gap this closes
 *
 * Picking a slot rewrites four properties — `--a-9…--a-12` — and nothing else.
 * Everything else brand-coloured in this product (`--p-*`, `--p-rgb`, the
 * ember structure ramp `--e-*`, and the warm literals in `WARM_LITERALS`) is
 * the shipped amber, declared once in `tokens/color.css` and never rewritten.
 * So "blue" has always meant "blue buttons on an orange site".
 *
 * Measured on `mr-mohammedadel.com`, whose row says `accent: blue`: `--a-9` is
 * the hand-tuned blue and `--p-500` computes to `#F28318`. His landing page
 * uses the `board` preset, which builds every solid block out of `--p-800`
 * and `--p-900` — so his home page is orange slabs under a blue button.
 *
 * ## Where the numbers come from
 *
 * `hue` is the slot's OWN `--a-9` hue, read out of `ACCENT_RAMPS` above, so
 * the generated half is the same colour as the half that already worked.
 *
 * `chromaScale` is that ramp's chroma against amber's 0.152, and it exists for
 * `slate`. Slate is a near-grey on purpose (chroma 0.020); generating its
 * `--p-*` and `--e-*` at full chroma would hand a teacher who deliberately
 * picked "no colour" a saturated blue landing page. The four saturated slots
 * sit slightly ABOVE amber and are left there — the per-step gamut clamp is
 * what actually bounds them.
 *
 * ⚠️ `amber` is in this table but is NEVER used from it. It is the shipped
 * default, and the one scheme that must render as literally nothing — see
 * `tenantScheme`.
 */
export const ACCENT_SLOT_SCHEMES: Record<AccentSlot, { hue: number; chromaScale: number }> = {
  amber: { hue: 72, chromaScale: 1 },
  cyan: { hue: 205, chromaScale: 0.72 },
  blue: { hue: 258, chromaScale: 1.12 },
  violet: { hue: 300, chromaScale: 1.12 },
  magenta: { hue: 340, chromaScale: 1.12 },
  slate: { hue: 250, chromaScale: 0.13 },
};

/**
 * The hue the DERIVED half of the scheme is cut from, or `null` for the one
 * configuration that must emit nothing at all.
 *
 * `null` is Ayman: `accent: amber` with no `accentHue`, which is what his row
 * says and what every row said before the hue field existed. His `--p-*`,
 * `--e-*` and warm literals are the hand-tuned values in `tokens/color.css`
 * and there is no generator that reproduces them — `primaryRamp(72)` puts step
 * 500 at `#D29748` where the shipped ramp reaches `#F28318` by drifting its
 * hue to 56 and 48 through the middle steps. So the default emits nothing and
 * the shipped file stands, byte for byte.
 *
 * Fail-closed in the right direction, too: a configuration this cannot
 * classify keeps the colours it already had.
 */
function tenantScheme(
  accent: AccentSlot,
  accentHue: number | null | undefined,
): { hue: number; chromaScale: number } | null {
  if (typeof accentHue === 'number' && Number.isFinite(accentHue)) {
    return { hue: accentHue, chromaScale: 1 };
  }
  if (accent === 'amber') return null;
  return ACCENT_SLOT_SCHEMES[accent] ?? null;
}

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
export function renderBrandingStyle(branding: {
  accent: AccentSlot;
  /**
   * A tenant's own hue, 0–359. When set it OVERRIDES `accent` and the accent
   * ramp is GENERATED rather than looked up.
   *
   * ⚠️ It is no longer what decides whether the rest of the scheme moves.
   * `--p-*`, `--e-*` and the warm literals used to ride on this flag, which
   * meant a teacher who picked `blue` from the swatch — no hue — got blue
   * buttons and an orange everything-else. They ride on `tenantScheme` now,
   * which says yes to every configuration except the shipped amber default.
   * A hue is the opt-in to a colour that is not one of the six, and nothing
   * more.
   */
  accentHue?: number | null;
  radius: RadiusSlot;
}): string {
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

  const hue = branding.accentHue;
  const generated = typeof hue === 'number' && Number.isFinite(hue);
  const scheme = tenantScheme(branding.accent, hue);

  /**
   * The accent ramp comes from the hue when there is one and from the slot
   * table otherwise — a slot's four values are hand-tuned and re-deriving them
   * would repaint a brand somebody picked from a swatch.
   *
   * Everything else comes from `scheme`, which is `null` only for the shipped
   * amber default. `--p-*` is the one overlap: `rampDeclarations` already
   * emits it on the hue path, so the slot path adds it separately rather than
   * emitting it twice.
   */
  const derived = (theme: 'light' | 'dark'): ReadonlyArray<readonly [string, string]> => {
    if (!scheme) return [];
    const literals = literalDeclarations(scheme.hue, scheme.chromaScale, theme);
    if (theme === 'dark') return literals;

    return [
      ...(generated ? [] : primaryDeclarations(scheme.hue, scheme.chromaScale)),
      ...emberDeclarations(scheme.hue, scheme.chromaScale),
      ...literals,
    ];
  };

  const light = declarations([
    ...(generated ? rampDeclarations(hue, 'light') : ramp(accent.light)),
    ...derived('light'),
    ...radiusPairs,
  ]);
  const dark = declarations([
    ...(generated ? rampDeclarations(hue, 'dark') : ramp(accent.dark)),
    ...derived('dark'),
  ]);

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
