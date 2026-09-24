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
  dark: { r: 0x0c / 255, g: 0x0c / 255, b: 0x18 / 255 },
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
export function primaryRamp(hue: number, chromaScale = 1): readonly Oklch[] {
  const peak = maxChroma(PRIMARY_PEAK_LIGHTNESS, hue) * CHROMA_SAFETY * chromaScale;

  return PRIMARY_LIGHTNESS.map((lightness, index) => ({
    l: lightness,
    c: chromaAt(lightness, hue, PRIMARY_SHAPE[index] as number, peak),
    h: hue,
  }));
}

/* ══════════════════════════════════════════════════════════════════════════
   Everything below here is the SECOND half of a tenant's colours — the half
   that used to be amber no matter who the teacher was.

   `accentRamp` and `primaryRamp` above cover `--a-*` and `--p-*`. What was
   missing is everything that is warm for a reason other than being a ramp
   step: the study surface's ember structure ramp, and a dozen literals sitting
   in stylesheets that could not be written as a token because the token did
   not exist yet.

   Measured on the live stacks before this existed: `mr-mohammedadel.com` ships
   `--a-9: oklch(0.620 0.170 258)` (blue, correct) next to `--p-500: #F28318`
   and `--p-rgb: 214 96 22` (amber, wrong), and its whole `board` landing page
   is built out of `--p-800`/`--p-900`. One page, two brands.
   ══════════════════════════════════════════════════════════════════════════ */

/** The hue `tokens/color.css` calls "the accent". Every offset below is measured from it. */
const AMBER_ACCENT_HUE = 72;

/**
 * Ember sits 37° BELOW the accent — hue 35 against the accent's 72.
 *
 * The docblock in `tokens/color.css` states the relationship the ramp has to
 * hold: "the primary's own neighbour … so it is unmistakably the same family,
 * and DEEP where the accent is bright". A fixed hue 35 satisfies that for
 * exactly one teacher. The OFFSET satisfies it for all of them, and it is the
 * part that was actually designed — the family resemblance, not the number.
 */
const EMBER_HUE_OFFSET = -37;

export const EMBER_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/**
 * The shipped ember ladder, lifted step for step from `tokens/color.css`.
 *
 * The LIGHTNESS column is the whole contrast guarantee. That file lists eight
 * measured ratios against it (white on `--e-700` at 7.30:1, `--e-600` on the
 * page at 5.04:1, `--e-300` on the dark page at 11.37:1, and the 3.43:1
 * separation from `--a-9` that keeps the surface readable in greyscale), and
 * every one of them is a function of lightness far more than of hue — which is
 * why the ladder is carried across unchanged rather than re-solved per hue.
 * `ramp.test.ts` re-measures all four contracts on all 360 hues, so "far more
 * than" is a claim under test rather than an assumption.
 *
 * Chroma is clamped per step the same way `primaryRamp` clamps: a hue's
 * ceiling moves with lightness, and a value over it is silently clipped by the
 * browser into a step its neighbour is indistinguishable from.
 */
const EMBER_LIGHTNESS = [
  0.977, 0.946, 0.902, 0.828, 0.745, 0.66, 0.552, 0.47, 0.392, 0.325, 0.222,
] as const;

const EMBER_CHROMA = [
  0.009, 0.026, 0.048, 0.07, 0.12, 0.17, 0.171, 0.14, 0.113, 0.089, 0.055,
] as const;

/**
 * Which step is read as TEXT, and against which page.
 *
 * `tokens/color.css` re-points `--e-ink` per theme: step 600 on paper, step
 * 300 on #08090A. Those two are the only ember steps a reader has to resolve
 * glyph shapes out of, so they are the only two that are SOLVED rather than
 * placed — everything else on the ladder is a band or a wash carrying white,
 * and a band is a UI component, not body text.
 *
 * Without the solve, measured across all 360 hues: step 600 bottoms out at
 * 4.38:1 around hue 182. A shortfall that small looks like nothing on screen
 * and still fails the axe run in `apps/web/e2e/study-surface-a11y.e2e.ts`.
 */
const EMBER_INK_STEP: Record<Theme, number> = { light: 6, dark: 3 };

/** The eleven `--e-*` steps for a tenant's hue. */
export function emberRamp(hue: number, chromaScale = 1): readonly Oklch[] {
  const emberHue = (((hue + EMBER_HUE_OFFSET) % 360) + 360) % 360;

  const placed: Oklch[] = EMBER_LIGHTNESS.map((lightness, index) => ({
    l: lightness,
    c: Math.min(
      (EMBER_CHROMA[index] as number) * chromaScale,
      maxChroma(lightness, emberHue) * CHROMA_SAFETY,
    ),
    h: emberHue,
  }));

  // `peak` is 1 because the ember chroma column is absolute, not a shape — so
  // `chromaAt` inside the solver reduces to the same clamp applied above.
  for (const theme of ['light', 'dark'] as const) {
    const index = EMBER_INK_STEP[theme];
    placed[index] = solveForContrast(
      emberHue,
      theme,
      (EMBER_CHROMA[index] as number) * chromaScale,
      1,
      TEXT_CONTRAST_TARGET,
      EMBER_LIGHTNESS[index] as number,
    );
  }
  return placed;
}

/**
 * A shipped literal, and the token that now carries it.
 *
 * ## Why a literal existed at all, and why it still does
 *
 * Each of these is a colour a stylesheet needed in a place a ramp step could
 * not reach — a gradient stop, an alpha wash that needs a bare `R G B`
 * triplet, a print sheet that must not follow the admin's dark theme. Every
 * one has a comment where it lives explaining that. The comments were right.
 * Their conclusion was one teacher too narrow: the value has to be CONCRETE,
 * it does not have to be AMBER.
 *
 * ## Why the literal stays the default and this only OVERRIDES it
 *
 * There is no derivation that reproduces these numbers. They are hand-picked
 * values sitting NEAR a rung rather than on it — `--site-accent-solid` is
 * `oklch(0.575 0.180 45)` where `--p-700` is `oklch(0.545 0.165 43)` — and the
 * brief is that Ayman's site does not change by a byte. So the literal stays
 * where it is, as the declared value of a token, and a tenant who is not the
 * shipped default gets this table re-cut at their hue on top of it.
 *
 * ## Why rotation rather than re-solving
 *
 * Lightness and chroma are kept and only the hue moves, because lightness is
 * what every measured contrast in those files depends on. `--site-accent-solid`
 * is documented at exactly 4.68:1 for white text, with the note that the step
 * above it measures 4.24:1 and fails the axe run; holding L holds the ratio
 * (within about 2%, re-measured for all 360 hues in `ramp.test.ts`), while
 * re-solving would move it off a value somebody measured on purpose.
 *
 * The offset from `AMBER_ACCENT_HUE` is preserved rather than the absolute
 * hue, so the family relationships survive: the CTA stays 27° below the
 * accent, the key light 16° below, the bounce 12° above.
 *
 * `light`/`dark` mirror how `tokens/color.css` declares the token. `dark: null`
 * means the token is declared ONCE there, so it is emitted in the light rule
 * only and inherited — writing it into all three rules would be two more
 * places to drift.
 */
type WarmLiteral = {
  readonly token: string;
  readonly light: Oklch;
  readonly dark: Oklch | null;
  /** Emit `R G B` instead of `oklch()`, for the `rgb(var(--x) / alpha)` washes. */
  readonly triplet?: true;
  /**
   * Light theme only: this fill carries WHITE label text and the ratio is in
   * the stylesheet as a number somebody measured. Holding lightness holds the
   * ratio for most hues and not for all of them — rotating
   * `--site-accent-solid`'s documented 4.68:1 lands at 4.07:1 around hue 171,
   * which is under the bar `e2e/a11y.e2e.ts` enforces with axe. So the fill is
   * darkened, and ONLY as far as the target needs.
   */
  readonly whiteTextLight?: number;
  /**
   * Light theme only: take whatever lightness shift the named token needed.
   *
   * A hover state is a fixed distance below its fill. Solving the fill without
   * moving the hover can put the hover ABOVE it on a bad hue, and a button
   * that gets lighter when you press it reads as broken rather than as a hover.
   */
  readonly followsLight?: string;
};

const WARM_LITERALS: readonly WarmLiteral[] = [
  /* The marketing surface's solid CTA, and its hover. `(site)/styles/theme.css`
     declares both three times over (base, explicit-dark, and a
     `prefers-color-scheme: light` copy that has to beat a `dark` attribute) —
     all three now read this token, so the four-copy drift risk goes with it. */
  {
    token: '--accent-cta',
    light: { l: 0.575, c: 0.18, h: 45 },
    dark: { l: 0.72, c: 0.175, h: 55 },
    whiteTextLight: TEXT_CONTRAST_TARGET,
  },
  {
    token: '--accent-cta-hover',
    light: { l: 0.525, c: 0.172, h: 44 },
    dark: { l: 0.78, c: 0.165, h: 58 },
    followsLight: '--accent-cta',
  },
  /* The two stops of the link hub's one solid row, on hover. Brighter than the
     CTA pair by design — it is the only button on that page. */
  { token: '--accent-cta-lift', light: { l: 0.68, c: 0.192, h: 50 }, dark: null },
  { token: '--accent-cta-lift-deep', light: { l: 0.615, c: 0.184, h: 46 }, dark: null },
  /* Near-black text that sits ON an accent fill (dark theme) and on white
     (`.site-btn--light`). Chroma 0.02 — barely a tint, and rotated anyway:
     a warm near-black on a blue brand is still the wrong warmth. */
  { token: '--on-accent-ink', light: { l: 0.18, c: 0.02, h: 50 }, dark: null },
  { token: '--on-light-ink', light: { l: 0.22, c: 0.02, h: 60 }, dark: null },
  /* The ink panel's lighting — the key light, the bounce off the far corner,
     and the warm corner of the stage gradient itself. `(auth)/auth.css` paints
     the sign-in aside with all three, which makes them the FIRST colour every
     student on every stack sees. Measured from the shipped literals:
     `rgb(255 138 26)`, `rgb(251 191 36)` and `#171208`. */
  { token: '--ink-key-rgb', light: { l: 0.748, c: 0.177, h: 56 }, dark: null, triplet: true },
  { token: '--ink-bounce-rgb', light: { l: 0.837, c: 0.164, h: 84 }, dark: null, triplet: true },
  { token: '--ink-warm', light: { l: 0.185, c: 0.021, h: 84 }, dark: null },
  /* Accent text ON an ink panel. This is the dark theme's `--a-11` written
     out, because an ink panel is dark in BOTH themes and `var(--a-11)` would
     hand it the light theme's dark orange half the time. */
  { token: '--ink-accent', light: { l: 0.845, c: 0.13, h: 78 }, dark: null },
  /* The print sheets. `books/print/print.css` says it in as many words: "the
     one colour Ayman's material is recognisable by, and this page ends up in a
     print shop's hands". Every teacher's packing lists and shipping labels
     were coming out of the printer in his gold. */
  { token: '--print-gold', light: { l: 0.767, c: 0.142, h: 72 }, dark: null },
  { token: '--print-gold-deep', light: { l: 0.623, c: 0.128, h: 68 }, dark: null },
  { token: '--print-gold-wash', light: { l: 0.97, c: 0.024, h: 83 }, dark: null },
];

/** The shipped literal moved to `hue`, keeping the lightness every measurement depends on. */
function rotate({ l, c, h }: Oklch, hue: number, chromaScale: number): Oklch {
  const rotated = (((hue + (h - AMBER_ACCENT_HUE)) % 360) + 360) % 360;
  return atLightness({ l, c: c * chromaScale, h }, l, rotated);
}

/**
 * The same colour at a different lightness and hue, with chroma re-clamped
 * ONLY if it no longer fits.
 *
 * Re-clamping at all is the load-bearing half: a hue's gamut ceiling moves
 * with lightness, so carrying a chroma across unchanged is how a solver
 * returns a colour the browser silently clips.
 *
 * Clamping only when NEEDED is the other half, and it is why this is not the
 * same `Math.min(c, ceiling * CHROMA_SAFETY)` the ramps use. `CHROMA_SAFETY`
 * shaves 3% off everything it touches, which is the right shape of margin for
 * a value a solver placed near the boundary and the wrong one for a literal
 * that is already displayable: `rgb(255 138 26)` sits exactly ON the sRGB edge
 * (its red channel is 255), so a blanket shave rewrote Ayman's own key light
 * as `253 139 36` — a colour nobody asked for, in the one place that must not
 * move.
 */
function atLightness({ c, h }: Oklch, lightness: number, hue = h): Oklch {
  const fits = isInGamut({ l: lightness, c, h: hue });
  return { l: lightness, c: fits ? c : maxChroma(lightness, hue) * CHROMA_SAFETY, h: hue };
}

/**
 * Darkened only as far as `target` requires, and not at all when it already
 * clears — the same discipline as `solveForContrast`, against white rather
 * than against the page.
 */
function darkenForWhiteText(color: Oklch, target: number): Oklch {
  const white = { r: 1, g: 1, b: 1 };
  const ratioAt = (lightness: number) =>
    contrastRatio(oklchToRgb(atLightness(color, lightness)), white);

  if (ratioAt(color.l) >= target) return color;
  if (ratioAt(0) < target) return atLightness(color, 0);

  let low = 0;
  let high = color.l;
  for (let step = 0; step < 20; step += 1) {
    const middle = (low + high) / 2;
    if (ratioAt(middle) >= target) low = middle;
    else high = middle;
  }
  return atLightness(color, low);
}

/**
 * `quantize`, then keep walking lightness until what actually gets WRITTEN
 * still clears the contract.
 *
 * Rounding to three decimals is not contrast-preserving, and the solvers above
 * return the value that EXACTLY meets their target — so a solve that lands on
 * 4.500:1 is written as 4.490:1 and is under the bar it existed to clear. This
 * was measured, not imagined: the CTA fill bottomed out at 4.4904 on hue 233
 * with the solve in place and the rounding un-checked.
 *
 * `direction` is which way "more readable" lies: darker on a light ground,
 * lighter on a dark one.
 */
function quantizeClearing(
  color: Oklch,
  clears: (candidate: Oklch) => boolean,
  direction: -1 | 1,
): Oklch {
  let candidate = quantize(color);

  for (let step = 0; step < 40 && !clears(candidate); step += 1) {
    const lightness = Math.min(1, Math.max(0, candidate.l + direction * 0.001));
    if (lightness === candidate.l) break;
    candidate = quantize(atLightness(candidate, lightness));
  }
  return candidate;
}

/** `R G B`, the shape `rgb(var(--x) / alpha)` needs. */
function triplet(color: Oklch): string {
  const { r, g, b } = oklchToRgb(color);
  return `${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}`;
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

/**
 * The eleven `--p-*` steps plus `--p-rgb`, as CSS pairs.
 *
 * Split out of `rampDeclarations` because the SLOT path needs it too. A slot
 * keeps its hand-tuned `--a-9…--a-12` — those four values are the brand a
 * teacher picked from a swatch and nothing should re-derive them — but it has
 * never written `--p-*` at all, and that is the single biggest source of
 * somebody else's orange on a teacher's site: 264 usages, including the whole
 * `board` preset, fall through to the amber shipped in `tokens/color.css`.
 *
 * `chromaScale` exists for `slate`, whose accent is a near-grey (chroma 0.020
 * against amber's 0.152). Generating its ramp at full chroma would hand a
 * teacher who deliberately picked "no colour" a saturated blue.
 */
export function primaryDeclarations(
  hue: number,
  chromaScale = 1,
): ReadonlyArray<readonly [string, string]> {
  const pairs: Array<readonly [string, string]> = [];
  const ramp = primaryRamp(hue, chromaScale);

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
  pairs.push(['--p-rgb', `${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}`]);

  return pairs;
}

/** The eleven `--e-*` steps, as CSS pairs. Theme-independent, like `--p-*`. */
export function emberDeclarations(
  hue: number,
  chromaScale = 1,
): ReadonlyArray<readonly [string, string]> {
  const ramp = emberRamp(hue, chromaScale);

  return ramp.map((color, index) => {
    const theme = index === EMBER_INK_STEP.light ? 'light' : index === EMBER_INK_STEP.dark ? 'dark' : null;
    const written = theme
      ? quantizeClearing(
          color,
          (candidate) =>
            contrastRatio(oklchToRgb(candidate), PAGE_BACKGROUND[theme]) >= TEXT_CONTRAST_TARGET,
          theme === 'light' ? -1 : 1,
        )
      : quantize(color);

    return [`--e-${EMBER_STEPS[index]}`, formatOklch(written)] as const;
  });
}

/**
 * The warm literals, re-cut at the tenant's hue.
 *
 * `theme` picks which half of a theme-dependent entry to emit; the
 * theme-independent ones come out with `light` and are inherited by the dark
 * rules, exactly as `tokens/color.css` declares them.
 */
export function literalDeclarations(
  hue: number,
  chromaScale: number,
  theme: Theme,
): ReadonlyArray<readonly [string, string]> {
  const pairs: Array<readonly [string, string]> = [];
  const shifts = new Map<string, number>();

  for (const literal of WARM_LITERALS) {
    const source = theme === 'dark' ? literal.dark : literal.light;
    if (!source) continue;

    const color = rotate(source, hue, chromaScale);

    let written: Oklch;

    if (theme === 'light' && literal.whiteTextLight !== undefined) {
      const target = literal.whiteTextLight;
      written = quantizeClearing(
        darkenForWhiteText(color, target),
        (candidate) => contrastRatio(oklchToRgb(candidate), { r: 1, g: 1, b: 1 }) >= target,
        -1,
      );
      shifts.set(literal.token, written.l - color.l);
    } else if (theme === 'light' && literal.followsLight) {
      const shift = shifts.get(literal.followsLight) ?? 0;
      written = quantize(shift === 0 ? color : atLightness(color, Math.max(0, color.l + shift)));
    } else {
      written = quantize(color);
    }

    pairs.push([literal.token, literal.triplet ? triplet(written) : formatOklch(written)]);
  }
  return pairs;
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
  if (theme === 'light') pairs.push(...primaryDeclarations(hue));

  return pairs;
}
