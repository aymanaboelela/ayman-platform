/**
 * OKLCH → sRGB, gamut clamping, and WCAG contrast. No dependencies.
 *
 * ## Why this exists
 *
 * `ACCENT_RAMPS` and the `--p-*` ramp in `../tokens/color.css` are hand-tuned
 * OKLCH triples — eleven steps for the ramp, four for the accent, twice over
 * for light and dark. That is fine for six shipped accents and impossible for
 * "every instructor picks their own colour": the numbers are not a formula,
 * they are somebody's afternoon, and the two things that make them correct —
 * staying inside sRGB and clearing a contrast target — are exactly the two
 * things a person cannot check by eye.
 *
 * So a generated palette needs to answer two questions per step, and both are
 * arithmetic:
 *
 *   · **Is this colour representable?** OKLCH is a much larger space than
 *     sRGB. `oklch(0.62 0.30 258)` is a perfectly valid coordinate and no
 *     screen can show it; a browser silently clips it, which is how a ramp
 *     ends up with two steps that look identical. The chroma a hue can hold
 *     varies enormously — a yellow at L=0.95 has almost none, a blue at L=0.5
 *     has a lot — so the ceiling has to be found per step, not assumed.
 *
 *   · **Can text be read on it?** WCAG contrast, against the real background.
 *
 * No dependency, deliberately. This is ~150 lines of well-specified matrix
 * arithmetic that both the web app and the API need (the API validates a
 * tenant's colour before storing it), and `culori` is 40× the size of the part
 * used and would have to be added to two packages.
 *
 * Coefficients are Björn Ottosson's published Oklab ↔ linear-sRGB matrices.
 */

/** Non-linear sRGB, each channel 0–1. */
export type Rgb = { readonly r: number; readonly g: number; readonly b: number };

/** An OKLCH colour: lightness 0–1, chroma ≥ 0, hue in degrees. */
export type Oklch = { readonly l: number; readonly c: number; readonly h: number };

/** The sRGB transfer function (linear → display-referred). */
function encodeGamma(channel: number): number {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

/** Its inverse (display-referred → linear). Also what WCAG luminance uses. */
function decodeGamma(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/**
 * OKLCH → linear sRGB. Channels may fall OUTSIDE 0–1, and that is the point:
 * `isInGamut` reads exactly that overflow, so this must not clamp.
 */
function oklchToLinearRgb({ l, c, h }: Oklch): { r: number; g: number; b: number } {
  const hueRadians = (h * Math.PI) / 180;
  const a = c * Math.cos(hueRadians);
  const b = c * Math.sin(hueRadians);

  const lRoot = l + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = l - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = l - 0.0894841775 * a - 1.291485548 * b;

  const lCubed = lRoot * lRoot * lRoot;
  const mCubed = mRoot * mRoot * mRoot;
  const sCubed = sRoot * sRoot * sRoot;

  return {
    r: 4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed,
    g: -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed,
    b: -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed,
  };
}

/** OKLCH → sRGB, clamped to 0–1. Use `isInGamut` first if clipping matters. */
export function oklchToRgb(color: Oklch): Rgb {
  const linear = oklchToLinearRgb(color);
  const clamp = (channel: number) => Math.min(1, Math.max(0, encodeGamma(channel)));
  return { r: clamp(linear.r), g: clamp(linear.g), b: clamp(linear.b) };
}

/**
 * Whether every channel lands inside sRGB before clamping.
 *
 * The epsilon absorbs floating-point noise at the boundary only — it is not a
 * tolerance for "nearly displayable". A colour outside the gamut is silently
 * clipped by the browser, and two ramp steps that clip to the same corner are
 * two steps a reader cannot tell apart.
 */
export function isInGamut(color: Oklch): boolean {
  const { r, g, b } = oklchToLinearRgb(color);
  const epsilon = 1e-6;
  return [r, g, b].every((channel) => channel >= -epsilon && channel <= 1 + epsilon);
}

/**
 * The largest chroma this lightness and hue can hold inside sRGB.
 *
 * Bisection rather than an analytic solve: the gamut boundary in OKLCH is not
 * a closed form, and 24 halvings of a 0–0.5 range settle to ~3e-8 — far below
 * the third decimal place these values are written to.
 *
 * Returns 0 for a lightness at which the hue holds no chroma at all (pure
 * white and pure black), which is correct rather than an error.
 */
export function maxChroma(lightness: number, hue: number): number {
  let low = 0;
  let high = 0.5;

  if (!isInGamut({ l: lightness, c: low, h: hue })) return 0;

  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    if (isInGamut({ l: lightness, c: middle, h: hue })) low = middle;
    else high = middle;
  }
  return low;
}

/** WCAG 2.x relative luminance of an sRGB colour. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * decodeGamma(r) + 0.7152 * decodeGamma(g) + 0.0722 * decodeGamma(b);
}

/** WCAG 2.x contrast ratio, 1–21. Order-independent. */
export function contrastRatio(first: Rgb, second: Rgb): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Contrast between two OKLCH colours, which is what the ramps are written in. */
export function contrastOklch(first: Oklch, second: Oklch): number {
  return contrastRatio(oklchToRgb(first), oklchToRgb(second));
}

/**
 * Black or white, whichever is more readable on `background`.
 *
 * This replaces a fixed ink literal. The audit of the six shipped accents
 * found the fixed value failing WCAG on two of them — which is not a rounding
 * error, it is button text a reader cannot see, and it is invisible to anyone
 * who only ever looks at the default.
 */
export function readableInk(background: Oklch): 'black' | 'white' {
  const onBlack = contrastOklch(background, { l: 0, c: 0, h: 0 });
  const onWhite = contrastOklch(background, { l: 1, c: 0, h: 0 });
  return onBlack >= onWhite ? 'black' : 'white';
}

/**
 * `oklch(L C H)` with the precision the existing tokens use.
 *
 * Three decimals on lightness and chroma, whole degrees on hue — matched to
 * `tokens/color.css` so a generated ramp diffs cleanly against a hand-written
 * one, and so the string stays inside `SAFE_DECLARATION` in `./branding.ts`.
 */
export function formatOklch({ l, c, h }: Oklch): string {
  const lightness = l.toFixed(3);
  const chroma = c.toFixed(3);
  const hue = Math.round(((h % 360) + 360) % 360);
  return `oklch(${lightness} ${chroma} ${hue})`;
}
