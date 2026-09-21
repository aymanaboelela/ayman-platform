import { describe, expect, it } from 'vitest';
import { contrastRatio, isInGamut, oklchToRgb, readableInk } from './oklch';
import {
  EMBER_STEPS,
  PRIMARY_STEPS,
  accentRamp,
  describeRamp,
  emberDeclarations,
  literalDeclarations,
  primaryRamp,
  rampDeclarations,
  type Theme,
} from './ramp';

/** Every hue a tenant could plausibly pick, at 15° — 24 whole schemes. */
const ALL_HUES = Array.from({ length: 24 }, (_, index) => index * 15);
const THEMES: readonly Theme[] = ['light', 'dark'];

const LIGHT_BG = { r: 0xfd / 255, g: 0xfc / 255, b: 0xfb / 255 };
const DARK_BG = { r: 0x08 / 255, g: 0x09 / 255, b: 0x0a / 255 };
const backgroundFor = (theme: Theme) => (theme === 'light' ? LIGHT_BG : DARK_BG);

describe('every generated colour is displayable', () => {
  it.each(ALL_HUES)('hue %i produces only in-gamut colours', (hue) => {
    // The whole reason this module exists rather than a lightness ramp: a
    // colour outside sRGB is silently clipped, and two clipped steps look
    // identical. If this fails the ramp has visibly collapsed somewhere.
    for (const theme of THEMES) {
      for (const color of accentRamp(hue, theme)) {
        expect(isInGamut(color), `accent ${theme} ${hue}`).toBe(true);
      }
    }
    for (const color of primaryRamp(hue)) {
      expect(isInGamut(color), `primary ${hue}`).toBe(true);
    }
  });
});

describe('the text step is readable on every hue', () => {
  it.each(ALL_HUES)('hue %i clears 4.5:1 for body text in both themes', (hue) => {
    for (const theme of THEMES) {
      const [, , eleven] = accentRamp(hue, theme);
      const ratio = contrastRatio(oklchToRgb(eleven), backgroundFor(theme));

      expect(ratio, `${theme} hue ${hue}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('a step stays where the ladder put it', () => {
  it.each(ALL_HUES)('hue %i keeps the dark fill at the ladder lightness', (hue) => {
    // The regression: the solver used to bisect from the theme extreme and
    // return the THRESHOLD, so every hue landed on exactly 3.00:1 and the dark
    // step 9 fell from L 0.78 to about L 0.48 — a dark fill on a dark page
    // where a bright one was designed. The ramp read as collapsed.
    const [nine] = accentRamp(hue, 'dark');

    expect(nine.l).toBeCloseTo(0.78, 2);
  });

  it('only moves a step when its own position cannot clear the target', () => {
    // Light amber at L 0.77 genuinely cannot reach 3:1 on a near-white page,
    // so it is allowed to darken — but not all the way to the extreme.
    const [nine] = accentRamp(72, 'light');

    expect(nine.l).toBeLessThan(0.77);
    expect(nine.l).toBeGreaterThan(0.6);
  });
});

describe('the ramps keep their shape', () => {
  it.each(ALL_HUES)('hue %i darkens monotonically down the primary ramp', (hue) => {
    const lightnesses = primaryRamp(hue).map((color) => color.l);

    for (let index = 1; index < lightnesses.length; index += 1) {
      expect(lightnesses[index], `step ${PRIMARY_STEPS[index]}`).toBeLessThan(
        lightnesses[index - 1] as number,
      );
    }
  });

  it.each(ALL_HUES)('hue %i gives every primary step a distinguishable neighbour', (hue) => {
    // The failure this catches is chroma clipping flattening two steps into
    // one. Lightness alone is not enough — two steps can differ in L and still
    // render the same if both clipped to the same corner of the gamut.
    const rendered = primaryRamp(hue).map((color) => {
      const { r, g, b } = oklchToRgb(color);
      return `${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}`;
    });

    expect(new Set(rendered).size).toBe(rendered.length);
  });

  it('produces eleven primary steps and four accent steps', () => {
    expect(primaryRamp(72)).toHaveLength(11);
    expect(PRIMARY_STEPS).toHaveLength(11);
    expect(accentRamp(72, 'light')).toHaveLength(4);
  });
});

describe('describeRamp', () => {
  it('gives amber a fill that clears 3:1, which the hand-tuned amber does not', () => {
    // The shipped `ACCENT_RAMPS.amber` measures 2.07:1 on the solid fill —
    // under what WCAG asks of a UI component. The generator reaches 3:1 at the
    // same hue by darkening, which is the whole difference between a value
    // placed by eye and one solved.
    //
    // It does NOT change Ayman's site: `branding.ts` keeps its six hand-tuned
    // entries, and this path is what a new instructor's colour goes through.
    const report = describeRamp(72);

    expect(report.allInGamut).toBe(true);
    expect(report.textContrast.light).toBeGreaterThanOrEqual(4.5);
    expect(report.fillContrast.light).toBeGreaterThanOrEqual(3);
    expect(report.warnings).toEqual([]);
  });

  it('clears 3:1 on the fill for every hue, in both themes', () => {
    for (const hue of ALL_HUES) {
      const report = describeRamp(hue);

      for (const theme of THEMES) {
        expect(report.fillContrast[theme], `hue ${hue} ${theme}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('has nothing to warn about on any hue, now that both steps are solved', () => {
    // If this ever fails, a hue has been found that cannot carry the platform's
    // own contrast floor — which is worth knowing loudly rather than shipping.
    const noisy = ALL_HUES.map((hue) => ({ hue, warnings: describeRamp(hue).warnings })).filter(
      (entry) => entry.warnings.length > 0,
    );

    expect(noisy).toEqual([]);
  });

  it('reports a blue as clean', () => {
    const report = describeRamp(258);

    expect(report.allInGamut).toBe(true);
    expect(report.fillContrast.light).toBeGreaterThanOrEqual(3);
  });

  it('never claims a hue is out of gamut, because the generator clamps', () => {
    for (const hue of ALL_HUES) {
      expect(describeRamp(hue).allInGamut, `hue ${hue}`).toBe(true);
    }
  });

  it('picks the ink with the better contrast on the fill', () => {
    for (const hue of ALL_HUES) {
      const report = describeRamp(hue);

      for (const theme of THEMES) {
        // Whatever it chose, it must beat 3:1 — a fill whose own label is
        // unreadable is the failure the fixed ink literal already ships on two
        // of the six accents.
        expect(report.inkContrast[theme], `hue ${hue} ${theme}`).toBeGreaterThan(3);
      }
    }
  });
});

describe('the fixed ink on the accent fill stays readable', () => {
  /**
   * `button.tsx` pairs `bg-accent` with the literal `#1A1206`, and
   * `globals.css` repeats it in three more places, on the stated assumption
   * that "the accent is bright in both themes".
   *
   * That assumption was FALSE while `solveForContrast` returned the threshold:
   * the dark fill collapsed to about L 0.48 and the near-black ink measured
   * 2.78:1 on it — button labels a reader could not make out. Fixing the ramp
   * fixed the ink, which is why there is no `--a-ink` token here.
   *
   * This test is what keeps that true. If the ramp ever darkens again, this
   * fails before anybody ships unreadable buttons, and THEN the ink has to
   * become a generated token.
   */
  const INK = { l: 0.167, c: 0.035, h: 70 } as const; // #1a1206 in OKLCH

  it.each(ALL_HUES)('hue %i keeps label text over 4.5:1 in both themes', (hue) => {
    for (const theme of THEMES) {
      const [fill] = accentRamp(hue, theme);

      expect(contrastRatio(oklchToRgb(fill), oklchToRgb(INK)), `${theme} hue ${hue}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('agrees with readableInk — the fixed literal is the right family', () => {
    // If `readableInk` ever preferred white on a generated fill, the fixed
    // near-black would be the wrong choice even where it technically passes.
    for (const hue of ALL_HUES) {
      for (const theme of THEMES) {
        const [fill] = accentRamp(hue, theme);
        expect({ hue, theme, ink: readableInk(fill) }).toEqual({ hue, theme, ink: 'black' });
      }
    }
  });
});

describe('rampDeclarations', () => {
  it('emits the accent in both themes and the shared primary ramp once', () => {
    const light = rampDeclarations(72, 'light').map(([property]) => property);
    const dark = rampDeclarations(72, 'dark').map(([property]) => property);

    expect(light).toContain('--a-9');
    expect(light).toContain('--p-500');
    expect(dark).toContain('--a-9');
    // The `--p-*` ramp is theme-independent, so writing it twice would be two
    // chances to drift.
    expect(dark.some((property) => property.startsWith('--p-'))).toBe(false);
  });

  it('passes the SAFE_DECLARATION regex branding.ts enforces', () => {
    const safe = /^--[a-z0-9-]+:[a-z0-9(). ,%/#-]+$/;

    for (const hue of ALL_HUES) {
      for (const theme of THEMES) {
        for (const [property, value] of rampDeclarations(hue, theme)) {
          expect(safe.test(`${property}:${value}`), `${property}:${value}`).toBe(true);
        }
      }
    }
  });

  it('emits --p-rgb, the triplet the glows and tinted shadows need', () => {
    // Without it a tenant on a blue hue gets blue everywhere the ramp reaches
    // and ORANGE glows everywhere `rgb(var(--p-rgb) / alpha)` does. Nothing
    // errors — the page is simply two brands at once.
    const light = new Map(rampDeclarations(258, 'light'));

    expect(light.has('--p-rgb')).toBe(true);
    expect(light.get('--p-rgb')).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
  });

  it('keeps --p-rgb and --p-600 the same colour, not two roundings of one', () => {
    const light = new Map(rampDeclarations(258, 'light'));
    const triplet = (light.get('--p-rgb') ?? '').split(' ').map(Number);
    const step600 = /oklch\(([\d.]+) ([\d.]+) (\d+)\)/.exec(light.get('--p-600') ?? '');

    expect(step600).not.toBeNull();
    if (!step600) return;
    const { r, g, b } = oklchToRgb({
      l: Number(step600[1]),
      c: Number(step600[2]),
      h: Number(step600[3]),
    });

    expect(triplet).toEqual([Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]);
  });

  it('never emits --p-rgb twice, since the ramp is theme-independent', () => {
    expect(rampDeclarations(258, 'dark').some(([p]) => p === '--p-rgb')).toBe(false);
  });

  it('rounds to three decimals without pushing a value out of gamut', () => {
    // `formatOklch` rounds, and a chroma sitting exactly on the ceiling can
    // round up past it. CHROMA_SAFETY exists for this; the test is what proves
    // the margin is actually enough.
    for (const hue of ALL_HUES) {
      for (const theme of THEMES) {
        for (const [property, value] of rampDeclarations(hue, theme)) {
          // `--p-rgb` is a bare `R G B` triplet, not an oklch() string — it is
          // the one value the washes need decomposed so they can take an alpha.
          if (property === '--p-rgb') continue;
          const match = /oklch\(([\d.]+) ([\d.]+) (\d+)\)/.exec(value);
          expect(match, value).not.toBeNull();
          if (!match) continue;

          const rounded = { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) };
          expect(isInGamut(rounded), `${value} at hue ${hue}`).toBe(true);
        }
      }
    }
  });
});

/** `oklch(L C H)` back to numbers, for asserting on what actually gets written. */
function parse(value: string): { l: number; c: number; h: number } {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (!match) throw new Error(`not an oklch value: ${value}`);
  return { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) };
}

const WHITE = { r: 1, g: 1, b: 1 };

/**
 * The generated ember ramp has to hold the same contracts the hand-tuned one
 * documents, on every hue rather than on hue 35.
 *
 * `tokens/color.css` lists eight measured ratios under "Measured, not chosen
 * by eye". Four of them are contracts a reader depends on, and they are the
 * four asserted here — on the QUANTIZED values, because rounding to three
 * decimals is not contrast-preserving and a solve that lands exactly on the
 * target gets written a hair under it.
 *
 * The fifth documented number, `--e-700` against `--a-9` at 3.43:1, is NOT
 * asserted. It is the colour-blind separation between the structure ramp and
 * the accent, and it is a property of amber specifically: it comes from the
 * 0.30 of lightness between `--a-9` at L 0.770 and `--e-700` at L 0.470. Every
 * other accent is darker — the shipped blue's `--a-9` is L 0.620 — so the gap
 * narrows for reasons that predate any of this, and it measures about 1.9:1 on
 * the blue slot as shipped today. Writing an assertion that the current code
 * cannot pass would only mean disabling it.
 */
describe('the generated ember ramp is readable on every hue', () => {
  const step = (hue: number, value: number) =>
    parse(new Map(emberDeclarations(hue)).get(`--e-${value}`)!);

  it.each(ALL_HUES)('hue %i: ember text clears 4.5:1 in both themes', (hue) => {
    // `--e-ink` is step 600 on paper and step 300 on #08090A.
    expect(contrastRatio(oklchToRgb(step(hue, 600)), LIGHT_BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(oklchToRgb(step(hue, 300)), DARK_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ALL_HUES)('hue %i: the stage bands carry white text', (hue) => {
    // `--e-stage` is step 700 on paper and step 800 on #08090A, and both carry
    // white — a band with unreadable text on it is the whole study surface.
    expect(contrastRatio(oklchToRgb(step(hue, 700)), WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(oklchToRgb(step(hue, 800)), WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it('emits all eleven steps, so a consumer cannot fall through to the shipped amber', () => {
    const emitted = emberDeclarations(258).map(([property]) => property);

    expect(emitted).toEqual(EMBER_STEPS.map((value) => `--e-${value}`));
  });

  it('every step is inside sRGB, so no two neighbours clip to the same corner', () => {
    for (const hue of ALL_HUES) {
      for (const [property, value] of emberDeclarations(hue)) {
        expect(isInGamut(parse(value)), `${property} at hue ${hue}`).toBe(true);
      }
    }
  });

  it('stays a neighbour of the accent rather than a second brand', () => {
    // 37° below, which is what hue 35 is to the accent's 72. The whole
    // argument in `tokens/color.css` for replacing violet with ember is that
    // structure must read as the same family as the accent.
    expect(step(72, 500).h).toBe(35);
    expect(step(258, 500).h).toBe(221);
  });
});

describe('the warm literals follow the tenant too', () => {
  it.each(ALL_HUES)('hue %i: white on the marketing CTA clears 4.5:1', (hue) => {
    // The stylesheet documents this fill at 4.68:1 and notes that the step
    // above it measures 4.24:1 and fails axe. Rotating alone lands at 4.07:1
    // around hue 171, which is why the fill is re-solved rather than moved.
    const cta = parse(new Map(literalDeclarations(hue, 1, 'light')).get('--accent-cta')!);

    expect(contrastRatio(oklchToRgb(cta), WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ALL_HUES)('hue %i: the CTA hover stays DARKER than the fill in light', (hue) => {
    // A button that gets lighter when you press it reads as broken. The hover
    // takes whatever lightness shift the fill's contrast solve needed, so the
    // pair cannot cross over.
    const light = new Map(literalDeclarations(hue, 1, 'light'));

    expect(parse(light.get('--accent-cta-hover')!).l).toBeLessThan(parse(light.get('--accent-cta')!).l);
  });

  it('re-cuts the print gold, which is the one colour that leaves the building', () => {
    // A teacher's packing lists and shipping labels are printed from their own
    // admin and handed to a print shop.
    const gold = parse(new Map(literalDeclarations(258, 1, 'light')).get('--print-gold')!);

    expect(gold.h).toBe(258);
    // The lightness is carried across unchanged — it is what makes the sheet
    // legible on paper with the backgrounds turned off.
    expect(gold.l).toBe(0.767);
  });

  it('emits the ink-panel triplets as bare R G B, not as a colour function', () => {
    // `rgb(var(--ink-key-rgb) / 0.26)` only works on a decomposed triplet.
    const light = new Map(literalDeclarations(258, 1, 'light'));

    expect(light.get('--ink-key-rgb')).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
    expect(light.get('--ink-bounce-rgb')).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
  });

  it('emits the theme-dependent pair in dark and nothing else', () => {
    // Everything else is declared once in `tokens/color.css` and inherited, so
    // writing it into the dark rules too would be two places to drift.
    expect(literalDeclarations(258, 1, 'dark').map(([property]) => property)).toEqual([
      '--accent-cta',
      '--accent-cta-hover',
    ]);
  });

  it('holds the shipped literal at amber, within a rounding step', () => {
    // The table stores these as OKLCH measured from the hexes in the
    // stylesheets. If a number there is wrong, this is where it shows: at
    // Ayman's own hue the rotation is a no-op and the output must be the
    // colour the stylesheet shipped.
    const light = new Map(literalDeclarations(72, 1, 'light'));
    const near = (value: string, expected: { r: number; g: number; b: number }) => {
      const { r, g, b } = oklchToRgb(parse(value));
      const channels = [r, g, b].map((channel) => Math.round(channel * 255));

      for (const [index, channel] of channels.entries()) {
        expect(Math.abs(channel - [expected.r, expected.g, expected.b][index]!)).toBeLessThanOrEqual(2);
      }
    };

    near(light.get('--ink-warm')!, { r: 0x17, g: 0x12, b: 0x08 });
    near(light.get('--print-gold')!, { r: 0xea, g: 0xa3, b: 0x3c });
    near(light.get('--print-gold-deep')!, { r: 0xb9, g: 0x76, b: 0x1a });
    near(light.get('--print-gold-wash')!, { r: 0xfd, g: 0xf4, b: 0xe3 });
    expect(light.get('--ink-key-rgb')).toBe('255 138 25');
    expect(light.get('--ink-bounce-rgb')).toBe('252 191 38');
  });
});
