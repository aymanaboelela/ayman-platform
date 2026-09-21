import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contrastOklch,
  contrastRatio,
  formatOklch,
  isInGamut,
  maxChroma,
  oklchToRgb,
  readableInk,
  relativeLuminance,
  type Oklch,
} from './oklch';

const BLACK = { l: 0, c: 0, h: 0 } as const;
const WHITE = { l: 1, c: 0, h: 0 } as const;

/** 0–1 channels as 0–255, which is how the reference values below are quoted. */
function to255({ r, g, b }: { r: number; g: number; b: number }) {
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

describe('oklchToRgb', () => {
  it('maps the achromatic ends exactly', () => {
    expect(to255(oklchToRgb(BLACK))).toEqual([0, 0, 0]);
    expect(to255(oklchToRgb(WHITE))).toEqual([255, 255, 255]);
  });

  it.each([
    // The three sRGB primaries and mid grey, in their published OKLCH
    // coordinates. These are the check that the matrices were transcribed
    // correctly — an error in one coefficient still round-trips plausibly for
    // greys and only shows up on a saturated colour.
    ['red', { l: 0.6279, c: 0.2577, h: 29.23 }, [255, 0, 0]],
    ['green', { l: 0.8664, c: 0.2948, h: 142.5 }, [0, 255, 0]],
    ['blue', { l: 0.452, c: 0.3132, h: 264.05 }, [0, 0, 255]],
    ['mid grey', { l: 0.5999, c: 0, h: 0 }, [128, 128, 128]],
  ])('converts %s within one 8-bit step', (_name, color, expected) => {
    const actual = to255(oklchToRgb(color as Oklch));

    for (const channel of [0, 1, 2]) {
      expect(Math.abs((actual[channel] ?? 0) - (expected[channel] ?? 0))).toBeLessThanOrEqual(1);
    }
  });
});

describe('isInGamut', () => {
  it('accepts a colour sRGB can show', () => {
    expect(isInGamut({ l: 0.77, c: 0.152, h: 72 })).toBe(true);
  });

  it('rejects a chroma no screen can reach', () => {
    // A perfectly valid OKLCH coordinate that the browser silently clips.
    expect(isInGamut({ l: 0.62, c: 0.4, h: 258 })).toBe(false);
  });

  it('knows that a very light yellow can hold almost no chroma', () => {
    // The ceiling at this lightness and hue is 0.0128 — which is BELOW the
    // 0.014 the shipped `--p-50` uses. See the recorded list at the bottom of
    // this file; the token clips by a hair.
    expect(isInGamut({ l: 0.985, c: 0.012, h: 78 })).toBe(true);
    expect(isInGamut({ l: 0.985, c: 0.15, h: 78 })).toBe(false);
  });
});

describe('maxChroma', () => {
  it('collapses to nothing at pure white', () => {
    expect(maxChroma(1, 200)).toBeCloseTo(0, 5);
  });

  it('is meaninglessly small rather than exactly zero at pure black', () => {
    // At L=0 every channel cubes to ~0 whatever the chroma, so a small value
    // still lands inside sRGB — arithmetically true and perceptually empty,
    // since the result is black either way. Asserting an exact 0 here would be
    // asserting a property the maths does not have.
    expect(maxChroma(0, 200)).toBeLessThan(0.02);
  });

  it('returns a chroma that is in gamut, and rejects a hair more', () => {
    for (const hue of [30, 78, 142, 205, 258, 320]) {
      for (const lightness of [0.3, 0.5, 0.7, 0.9]) {
        const ceiling = maxChroma(lightness, hue);

        expect(isInGamut({ l: lightness, c: ceiling, h: hue }), `${hue}@${lightness}`).toBe(true);
        expect(isInGamut({ l: lightness, c: ceiling + 0.01, h: hue }), `${hue}@${lightness}`).toBe(
          false,
        );
      }
    }
  });

  it('reflects that hues differ enormously in how much chroma they hold', () => {
    // The reason a ramp cannot use one chroma ladder for every hue: yellow at
    // high lightness is nearly achromatic while blue at mid lightness is not.
    expect(maxChroma(0.95, 90)).toBeLessThan(0.12);
    expect(maxChroma(0.5, 264)).toBeGreaterThan(0.15);
  });
});

describe('contrast', () => {
  it('gives 21:1 for black on white', () => {
    expect(contrastOklch(BLACK, WHITE)).toBeCloseTo(21, 1);
  });

  it('gives 1:1 for a colour against itself', () => {
    expect(contrastOklch({ l: 0.62, c: 0.17, h: 258 }, { l: 0.62, c: 0.17, h: 258 })).toBeCloseTo(
      1,
      5,
    );
  });

  it('is order-independent', () => {
    const a = { r: 0.1, g: 0.2, b: 0.3 };
    const b = { r: 0.9, g: 0.8, b: 0.7 };

    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });

  it('matches the luminance definition at the ends', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 6);
    expect(relativeLuminance({ r: 1, g: 1, b: 1 })).toBeCloseTo(1, 6);
  });
});

describe('readableInk', () => {
  it('puts black on a light fill and white on a dark one', () => {
    expect(readableInk({ l: 0.9, c: 0.05, h: 78 })).toBe('black');
    expect(readableInk({ l: 0.25, c: 0.05, h: 258 })).toBe('white');
  });

  it('always picks the higher-contrast of the two', () => {
    for (const lightness of [0.2, 0.35, 0.5, 0.62, 0.77, 0.9]) {
      const fill = { l: lightness, c: 0.1, h: 258 };
      const ink = readableInk(fill);
      const chosen = contrastOklch(fill, ink === 'black' ? BLACK : WHITE);
      const other = contrastOklch(fill, ink === 'black' ? WHITE : BLACK);

      expect(chosen).toBeGreaterThanOrEqual(other);
    }
  });
});

describe('formatOklch', () => {
  it('writes the precision the shipped tokens use', () => {
    expect(formatOklch({ l: 0.77, c: 0.152, h: 72 })).toBe('oklch(0.770 0.152 72)');
  });

  it('normalises hue into 0–359 so a wrapped value is still valid CSS', () => {
    expect(formatOklch({ l: 0.5, c: 0.1, h: 400 })).toBe('oklch(0.500 0.100 40)');
    expect(formatOklch({ l: 0.5, c: 0.1, h: -20 })).toBe('oklch(0.500 0.100 340)');
  });

  it('stays inside the SAFE_DECLARATION character set used by branding.ts', () => {
    // `renderBrandingStyle` throws on anything this regex rejects, so a
    // generated value that cannot pass it would fail at render rather than
    // here — on the page, for the tenant, at first paint.
    const safe = /^--[a-z0-9-]+:[a-z0-9(). ,%/#-]+$/;

    for (const hue of [0, 45, 137, 258, 359]) {
      expect(safe.test(`--a-9:${formatOklch({ l: 0.62, c: 0.17, h: hue })}`)).toBe(true);
    }
  });
});

describe('the shipped hand-tuned ramps', () => {
  /**
   * Reads every OKLCH literal out of the real token file.
   *
   * This is the test that validates the conversion against something other
   * than my own arithmetic: those values were tuned by eye against a screen,
   * so if this module disagrees with them about what sRGB can show, this
   * module is wrong.
   */
  const source = readFileSync(join(__dirname, '..', 'tokens', 'color.css'), 'utf8');
  const literals = [...source.matchAll(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g)].map(
    (match) => ({
      l: Number(match[1]),
      c: Number(match[2]),
      h: Number(match[3]),
      text: match[0],
    }),
  );

  it('finds the ramps at all', () => {
    expect(literals.length).toBeGreaterThan(40);
  });

  /**
   * Ten shipped tokens ask for more chroma than sRGB can show at their
   * lightness and hue, so the browser clips them.
   *
   * This is RECORDED rather than asserted away, and not fixed here. Each one
   * is somebody's tuned value on a live site, and changing it changes how the
   * platform looks — a decision, not a cleanup. What the list buys is that an
   * ELEVENTH one fails this test, which is the only way anybody would ever
   * find out: a clipped colour does not throw, it just renders slightly duller
   * than written, and only on the hues where it happens.
   *
   * The worst is `--a-12` in the dark theme, 0.090 against a 0.074 ceiling.
   *
   * ⚠️ The five `--accent-cta*` entries are not NEW clipping. They are the
   * `--site-accent-solid` family, which sat in `(site)/styles/theme.css` and
   * `(link)/styles/linkhub.css` — outside anything this test could see — and
   * clipped there exactly as they clip here. Promoting them to tokens is what
   * brought them into view, and they are carried across byte for byte because
   * they are Ayman's live CTA; re-tuning them is a separate decision with
   * `e2e/a11y.e2e.ts` attached to it.
   */
  const KNOWN_CLIPPING = [
    'oklch(0.520 0.120 62)', // amber --a-11, light       (ceiling 0.1197)
    'oklch(0.545 0.165 43)', // --p-700                   (ceiling 0.1614)
    'oklch(0.640 0.190 48)', // --p-600                   (ceiling 0.1743)
    'oklch(0.920 0.090 80)', // amber --a-12, dark        (ceiling 0.0743)
    'oklch(0.985 0.014 78)', // --p-50                    (ceiling 0.0128)
    'oklch(0.575 0.180 45)', // --accent-cta, light
    'oklch(0.525 0.172 44)', // --accent-cta-hover, light
    'oklch(0.780 0.165 58)', // --accent-cta-hover, dark
    'oklch(0.680 0.192 50)', // --accent-cta-lift
    'oklch(0.615 0.184 46)', // --accent-cta-lift-deep
  ];

  it('clip in exactly the ten places already known, and nowhere new', () => {
    const clipped = [...new Set(literals.filter((color) => !isInGamut(color)).map((c) => c.text))];

    expect(clipped.sort()).toEqual([...KNOWN_CLIPPING].sort());
  });

  it('are otherwise at or below the chroma ceiling for their hue', () => {
    const over = literals
      .filter((color) => color.c > maxChroma(color.l, color.h) + 1e-6)
      .map((color) => color.text);

    expect([...new Set(over)].sort()).toEqual([...KNOWN_CLIPPING].sort());
  });
});
