import { describe, expect, it } from 'vitest';
import { contrastRatio, isInGamut, oklchToRgb } from './oklch';
import {
  PRIMARY_STEPS,
  accentRamp,
  describeRamp,
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

  it('rounds to three decimals without pushing a value out of gamut', () => {
    // `formatOklch` rounds, and a chroma sitting exactly on the ceiling can
    // round up past it. CHROMA_SAFETY exists for this; the test is what proves
    // the margin is actually enough.
    for (const hue of ALL_HUES) {
      for (const theme of THEMES) {
        for (const [, value] of rampDeclarations(hue, theme)) {
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
