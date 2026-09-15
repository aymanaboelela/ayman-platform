import {
  contrastRatio,
  formatOklch,
  isInGamut,
  maxChroma,
  oklchToRgb,
  readableInk,
  type Oklch,
  type Rgb,
} from './oklch';

/**
 * A whole colour scheme from one hue.
 *
 * ## What this replaces
 *
 * `ACCENT_RAMPS` in `./branding.ts` is six hand-tuned accents, and switching
 * between them rewrites only `--a-9…--a-12`. The `--p-50…--p-950` ramp in
 * `../tokens/color.css` is a separate hand-tuned amber that NOTHING rewrites —
 * so picking "blue" today turns 145 usages blue and leaves 116 amber, and the
 * heaviest of those 116 are `(site)/styles/sections.css` and `theme.css`, i.e.
 * the landing page. The accent picker has always been half a picker.
 *
 * ## How the numbers are chosen
 *
 * The LIGHTNESS ladders are lifted from the shipped amber, unchanged. In OKLCH
 * lightness is perceptual and roughly hue-independent, so the same ladder on a
 * different hue produces a ramp with the same rhythm — which is the part that
 * was actually designed, as opposed to measured.
 *
 * The CHROMA at each step is `shape × peak`, clamped to what sRGB can show at
 * that lightness and hue. Both halves matter:
 *
 *   · `shape` is the shipped amber's chroma curve normalised to its peak —
 *     low at both ends because full chroma at step 50 stains a tinted
 *     background and at step 950 turns muddy.
 *   · the clamp is not optional. A hue's chroma ceiling varies enormously with
 *     lightness, and a value above it is silently clipped by the browser —
 *     which is how two adjacent steps end up identical. Five of the fifty
 *     shipped literals are over their ceiling today (see `oklch.test.ts`).
 *
 * ## Why steps 9 and 11 are SOLVED and the rest are placed
 *
 * A fixed lightness ladder does not give a fixed contrast. OKLCH lightness is
 * perceptual; WCAG luminance is a weighted sum of linear channels that treats
 * green as ten times more luminous than blue. So the same L on two hues can be
 * two very different contrasts — measured here, a blue placed at amber's
 * L=0.770 reaches **2.03:1** against the page, where the hand-tuned blue at
 * L=0.620 reaches **3.61:1**. That gap is exactly why the six shipped accents
 * each carry their own lightness rather than sharing one.
 *
 * So the two steps with a contract are solved for it:
 *
 *   · **step 9**, the solid fill, to 3:1 — what WCAG asks of a UI component.
 *   · **step 11**, body text on the page, to 4.5:1.
 *
 * Steps 10 and 12 are placed relative to the ladder; they are a hover state
 * and a high-contrast step, and both inherit their safety from the two above.
 *
 * ## Ayman's amber is NOT regenerated
 *
 * Amber's fill measures 2.07:1 today and cannot reach 3:1 without going dark
 * enough to stop being amber. That is not a bug this module gets to fix — it
 * is a live brand on a live site. `ACCENT_RAMPS` in `./branding.ts` keeps its
 * six hand-tuned entries and Ayman keeps his; this generator is what a NEW
 * instructor's colour goes through, where correct-by-construction costs
 * nobody anything.
 */

export type Theme = 'light' | 'dark';

/** `--n-1` in each theme: the page behind everything. */
const PAGE_BACKGROUND: Record<Theme, Rgb> = {
  light: { r: 0xfd / 255, g: 0xfc / 255, b: 0xfb / 255 },
  dark: { r: 0x08 / 255, g: 0x09 / 255, b: 0x0a / 255 },
};

/** Step 11 is body text on the page. Below this it is not readable. */
const TEXT_CONTRAST_TARGET = 4.5;

/** Step 9 is a solid fill — a UI component, which WCAG puts at 3:1. */
const FILL_CONTRAST_TARGET = 3;

/**
 * Chroma is held just under the ceiling rather than exactly on it: the ceiling
 * is found by bisection and a value sitting on the boundary can land a hair
 * outside once rounded to three decimals for CSS.
 */
const CHROMA_SAFETY = 0.97;

/** Lightness and chroma-shape ladders, taken from the shipped amber ramps. */
const ACCENT_LADDER: Record<Theme, { lightness: readonly number[]; shape: readonly number[] }> = {
  light: { lightness: [0.77, 0.725, 0.52, 0.3], shape: [0.981, 1.0, 0.774, 0.387] },
  dark: { lightness: [0.78, 0.82, 0.845, 0.92], shape: [1.0, 1.0, 0.867, 0.6] },
};

/** The `--p-*` ramp is one set of eleven, shared by both themes. */
const PRIMARY_LIGHTNESS = [
  0.985, 0.96, 0.918, 0.862, 0.795, 0.72, 0.64, 0.545, 0.445, 0.36, 0.235,
] as const;

const PRIMARY_SHAPE = [
  0.074, 0.168, 0.337, 0.537, 0.737, 0.895, 1.0, 0.868, 0.674, 0.5, 0.316,
] as const;

export const PRIMARY_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** The lightness at which each ladder's chroma peaks, so `peak` is measured there. */
const ACCENT_PEAK_LIGHTNESS: Record<Theme, number> = { light: 0.725, dark: 0.8 };
const PRIMARY_PEAK_LIGHTNESS = 0.64;

function chromaAt(lightness: number, hue: number, shape: number, peak: number): number {
  return Math.min(shape * peak, maxChroma(lightness, hue) * CHROMA_SAFETY);
}

/**
 * Keeps a step where the ladder puts it, and moves it ONLY as far as the
 * contrast target requires.
 *
 * ## The bug this shape exists to avoid
 *
 * The first version bisected between the two theme extremes and returned the
 * threshold — the exact lightness at which the target is first met. That does
 * meet the target, and it throws the designed ladder away: every hue landed on
 * precisely 3.00:1 and 4.50:1, and in the dark theme step 9 fell from the
 * ladder's L 0.78 to about L 0.48, which is a dark fill on a dark page where a
 * bright one was intended. The ramp reads as collapsed rather than dark.
 *
 * So `preferred` is tried FIRST and kept whenever it already clears the
 * target. The search only runs when it does not, and then it runs between the
 * preferred lightness and the readable extreme — returning the value CLOSEST
 * to where the ladder wanted it that still clears.
 *
 * Chroma is recomputed at every candidate, because the gamut ceiling moves
 * with lightness; holding it fixed while searching is how a solver returns a
 * colour that is out of gamut.
 *
 * Returns the best it can reach. On a hue that cannot make the target at any
 * lightness the caller still gets a usable colour and `describeRamp` reports
 * the shortfall, which is better than throwing at render time.
 */
function solveForContrast(
  hue: number,
  theme: Theme,
  shape: number,
  peak: number,
  target: number,
  preferred: number,
): Oklch {
  const background = PAGE_BACKGROUND[theme];
  const contrastAt = (lightness: number) => {
    const color = { l: lightness, c: chromaAt(lightness, hue, shape, peak), h: hue };
    return { color, ratio: contrastRatio(oklchToRgb(color), background) };
  };

  // Where the ladder wanted it. Most hues clear the target here and never move.
  const atPreferred = contrastAt(preferred);
  if (atPreferred.ratio >= target) return atPreferred.color;

  // It does not clear. On a light page the readable direction is darker
  // (towards 0); on a dark page it is lighter (towards 1).
  const extreme = theme === 'light' ? 0 : 1;
  if (contrastAt(extreme).ratio < target) return contrastAt(extreme).color;

  // `low` is the end that is known to clear, `high` the one that is known not
  // to — so the bisection converges on the point closest to `preferred` that
  // still clears, rather than on the far side of the range.
  let low = extreme;
  let high = preferred;

  for (let step = 0; step < 20; step += 1) {
    const middle = (low + high) / 2;
    if (contrastAt(middle).ratio >= target) low = middle;
    else high = middle;
  }
  return contrastAt(low).color;
}

/** The four accent steps for one theme: 9 solid, 10 hover, 11 text, 12 high-contrast. */
export function accentRamp(hue: number, theme: Theme): readonly [Oklch, Oklch, Oklch, Oklch] {
  const { lightness, shape } = ACCENT_LADDER[theme];
  const peak = maxChroma(ACCENT_PEAK_LIGHTNESS[theme], hue) * CHROMA_SAFETY;

  const step = (index: number): Oklch => ({
    l: lightness[index] as number,
    c: chromaAt(lightness[index] as number, hue, shape[index] as number, peak),
    h: hue,
  });

  // Solved, not placed — see the module note on why a fixed ladder cannot hold
  // a contrast across hues.
  const nine = solveForContrast(
    hue,
    theme,
    shape[0] as number,
    peak,
    FILL_CONTRAST_TARGET,
    lightness[0] as number,
  );
  const eleven = solveForContrast(
    hue,
    theme,
    shape[2] as number,
    peak,
    TEXT_CONTRAST_TARGET,
    lightness[2] as number,
  );

  // Hover sits one rung from the fill in the direction the ladder already
  // moves, rather than at its own absolute lightness: once step 9 has been
  // solved, an absolute step 10 could land on the wrong side of it.
  const hoverDelta = (lightness[1] as number) - (lightness[0] as number);
  const tenLightness = Math.min(1, Math.max(0, nine.l + hoverDelta));
  const ten: Oklch = {
    l: tenLightness,
    c: chromaAt(tenLightness, hue, shape[1] as number, peak),
    h: hue,
  };

  const twelve = step(3);

  return [nine, ten, eleven, twelve];
}

/** The eleven `--p-*` steps. One set, shared by both themes, as today. */
export function primaryRamp(hue: number): readonly Oklch[] {
  const peak = maxChroma(PRIMARY_PEAK_LIGHTNESS, hue) * CHROMA_SAFETY;

  return PRIMARY_LIGHTNESS.map((lightness, index) => ({
    l: lightness,
    c: chromaAt(lightness, hue, PRIMARY_SHAPE[index] as number, peak),
    h: hue,
  }));
}

/**
 * The colour as it will actually be WRITTEN, gamut-checked after rounding.
 *
 * `formatOklch` prints three decimals, and rounding is not gamut-preserving:
 * a chroma of 0.00776 sitting just under a 0.0078 ceiling prints as `0.008`
 * and is now over it. `CHROMA_SAFETY` shaves a proportion, which is the wrong
 * shape of margin — at a chroma of 0.008 three percent is 0.0002, well under
 * the 0.0005 that rounding can add.
 *
 * So the rounded value is checked, and chroma is walked down in whole
 * printable steps until what gets written is displayable. Lightness is left
 * alone: it is the axis the ladder and the contrast solve both depend on.
 */
function quantize({ l, c, h }: Oklch): Oklch {
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const lightness = round(l);
  let chroma = round(c);

  while (chroma > 0 && !isInGamut({ l: lightness, c: chroma, h })) {
    chroma = round(chroma - 0.001);
  }
  return { l: lightness, c: Math.max(0, chroma), h };
}

export type RampReport = {
  readonly hue: number;
  /** Contrast of the solid fill against the page, per theme. Under 3 is a warning. */
  readonly fillContrast: Record<Theme, number>;
  /** Contrast of the text step against the page, per theme. Under 4.5 is a failure. */
  readonly textContrast: Record<Theme, number>;
  /** Black or white on the solid fill, per theme. */
  readonly inkOnFill: Record<Theme, 'black' | 'white'>;
  /** Contrast of that ink on the fill. Under 4.5 means button labels are hard to read. */
  readonly inkContrast: Record<Theme, number>;
  /** Every generated colour is inside sRGB. False would be a bug in this module. */
  readonly allInGamut: boolean;
  /** Human-readable problems, empty when the hue is safe to ship. */
  readonly warnings: readonly string[];
};

/**
 * Everything the settings screen needs to say "this colour is fine" or not.
 *
 * The point of returning a report rather than throwing: a tenant picking their
 * brand colour should be told that their yellow gives 2.1:1 on buttons, not
 * silently handed a darker yellow that is no longer their brand — and equally
 * not silently handed an unreadable page.
 */
export function describeRamp(hue: number): RampReport {
  const warnings: string[] = [];
  const fillContrast = {} as Record<Theme, number>;
  const textContrast = {} as Record<Theme, number>;
  const inkOnFill = {} as Record<Theme, 'black' | 'white'>;
  const inkContrast = {} as Record<Theme, number>;
  let allInGamut = true;

  for (const theme of ['light', 'dark'] as const) {
    const [nine, , eleven] = accentRamp(hue, theme);
    const background = PAGE_BACKGROUND[theme];

    fillContrast[theme] = contrastRatio(oklchToRgb(nine), background);
    textContrast[theme] = contrastRatio(oklchToRgb(eleven), background);

    const ink = readableInk(nine);
    inkOnFill[theme] = ink;
    inkContrast[theme] = contrastRatio(
      oklchToRgb(nine),
      ink === 'black' ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 },
    );

    if (textContrast[theme] < TEXT_CONTRAST_TARGET) {
      warnings.push(
        `${theme}: body text on the page reaches only ${textContrast[theme].toFixed(2)}:1 ` +
          `(needs ${TEXT_CONTRAST_TARGET}). This hue cannot carry readable text at any lightness.`,
      );
    }
    if (fillContrast[theme] < 3) {
      warnings.push(
        `${theme}: the solid fill is ${fillContrast[theme].toFixed(2)}:1 against the page ` +
          `(WCAG asks 3:1 for a UI component). Buttons will be hard to pick out. ` +
          `Amber measures 2.07:1 and ships, so this is a judgement, not a block.`,
      );
    }
    if (inkContrast[theme] < 4.5) {
      warnings.push(
        `${theme}: label text on a filled button reaches ${inkContrast[theme].toFixed(2)}:1.`,
      );
    }

    for (const color of [...accentRamp(hue, theme), ...primaryRamp(hue)]) {
      if (!isInGamut(color)) allInGamut = false;
    }
  }

  return { hue, fillContrast, textContrast, inkOnFill, inkContrast, allInGamut, warnings };
}

/** The generated ramps as CSS custom-property pairs, ready for `renderBrandingStyle`. */
export function rampDeclarations(
  hue: number,
  theme: Theme,
): ReadonlyArray<readonly [string, string]> {
  const accent = accentRamp(hue, theme);
  const pairs: Array<readonly [string, string]> = [
    ['--a-9', formatOklch(quantize(accent[0]))],
    ['--a-10', formatOklch(quantize(accent[1]))],
    ['--a-11', formatOklch(quantize(accent[2]))],
    ['--a-12', formatOklch(quantize(accent[3]))],
  ];

  // The `--p-*` ramp is theme-independent today, so it is emitted with the
  // light block only — writing it twice would be two chances to drift.
  if (theme === 'light') {
    const ramp = primaryRamp(hue);
    ramp.forEach((color, index) => {
      pairs.push([`--p-${PRIMARY_STEPS[index]}`, formatOklch(quantize(color))]);
    });

    /**
     * `--p-rgb` — the same colour again as a bare `R G B` triplet.
     *
     * `tokens/color.css` declares it once as `214 96 22` (amber `--p-600`) for
     * the `rgb(var(--p-rgb) / alpha)` washes: the glows, the tinted shadows and
     * the soft fills across the landing page and the link hub. It is the one
     * brand value that is not an `oklch()` string, because a CSS custom
     * property cannot be given an alpha without being decomposed first.
     *
     * Not emitting it was the bug: a tenant on a blue hue got blue everywhere
     * the ramp reaches and ORANGE glows everywhere the washes do. Nothing
     * errors; the page is simply two brands at once.
     *
     * Step 600 to match what the file already ships, and the QUANTIZED colour
     * so this triplet and `--p-600` are the same colour rather than two
     * roundings of one.
     */
    const washSource = quantize(ramp[6] as Oklch);
    const { r, g, b } = oklchToRgb(washSource);
    pairs.push([
      '--p-rgb',
      `${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}`,
    ]);
  }
  return pairs;
}
