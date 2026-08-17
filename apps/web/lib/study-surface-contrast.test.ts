import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The navy dark palette, measured rather than eyeballed.
 *
 * ## Why this ramp exists at all, and why it is scoped
 *
 * The signed-in student surface asks for a COOL dark ground — «عايز درجة
 * الدارك مود تبقى بالشكل ده», against a reference dashboard that is navy. The
 * product's global dark base is deliberately the opposite: `--n-1: #08090A`
 * warming to `#100F0E`, because the marketing surface is lit by an orange key
 * light and a cool dashboard beside it "reads as a different company's
 * software" (`packages/ui/src/tokens/color.css`).
 *
 * Both are right, for different rooms. So the navy is a SCOPED re-pointing of
 * the neutral ramp under `.study-surface` — the wrapper `(app)/layout.tsx` puts
 * around the student shell — and the global tokens are untouched. The
 * marketing site, the admin, and the auth pages keep the warm ramp because
 * nothing there carries that class.
 *
 * ## What this test is actually guarding
 *
 * A scoped ramp is the easy kind of change to get quietly wrong. The surface
 * steps move, the semantic tokens that were tuned against the OLD surface do
 * not, and `--err` on a card silently drops under 4.5:1 — visible to nobody
 * reviewing a diff of hex codes. That is exactly what the first draft of this
 * ramp did (`--err` measured 4.28:1 on `--n-3`), which is why `--err` is
 * re-pointed one step lighter inside the scope and why every semantic is
 * re-measured here against the navy surfaces rather than assumed.
 *
 * The math is the same OKLab → sRGB → WCAG path `packages/ui/src/tokens/
 * tokens.test.ts` uses. It is duplicated rather than imported for the reason
 * that file gives: a 20-line check should not add a cross-package test-helper
 * dependency.
 */

const STUDY_CSS = readFileSync(join(import.meta.dirname, '..', 'app', 'study.css'), 'utf8');

/** The scoped dark block behind the OS setting. */
const MEDIA_DARK =
  /:root:not\(\[data-theme='light'\]\)\s+\.study-surface\s*\{([^}]*)\}/s;
/** The scoped dark block behind the explicit toggle. */
const ATTR_DARK = /:root\[data-theme='dark'\]\s+\.study-surface\s*\{([^}]*)\}/s;

const extract = (pattern: RegExp): string => {
  const body = STUDY_CSS.match(pattern)?.[1];
  if (body === undefined) throw new Error(`block not found: ${pattern}`);
  return body;
};

const normalizeWhitespace = (s: string) => s.replace(/\s+/g, ' ').trim();

function oklchToLinearSrgb(L: number, C: number, hueDeg: number): [number, number, number] {
  const h = (hueDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const linearToSrgbChannel = (value: number): number => {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
};

const srgbToLinearChannel = (value: number): number =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

const luminanceOfChannels = ([r, g, b]: number[]): number =>
  0.2126 * srgbToLinearChannel(r as number) +
  0.7152 * srgbToLinearChannel(g as number) +
  0.0722 * srgbToLinearChannel(b as number);

const luminanceOfOklch = (L: number, C: number, H: number): number =>
  luminanceOfChannels(oklchToLinearSrgb(L, C, H).map(linearToSrgbChannel));

const channelsOfHex = (hex: string): number[] =>
  [0, 2, 4].map((i) => Number.parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255);

const luminanceOfHex = (hex: string): number => luminanceOfChannels(channelsOfHex(hex));

const contrastRatio = (a: number, b: number): number => {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
};

function readHexToken(body: string, name: string): string {
  const match = body.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!match) throw new Error(`token --${name} not found in the study-surface block`);
  return match[1] as string;
}

function readOklchToken(body: string, name: string): [number, number, number] {
  const match = body.match(
    new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`),
  );
  if (!match) throw new Error(`token --${name} not found in the study-surface block`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

const MIN_TEXT_CONTRAST = 4.5;
/** The three surfaces a student actually reads text off: ground, card, raised. */
const SURFACE_STEPS = ['n-1', 'n-2', 'n-3'] as const;

describe('the navy study surface', () => {
  const mediaBody = extract(MEDIA_DARK);
  const attrBody = extract(ATTR_DARK);

  it('declares the same palette behind the OS setting and the explicit toggle', () => {
    // The toggle has to win in BOTH directions, which is only true if the two
    // blocks agree — the identical requirement `color.css` holds itself to.
    expect(normalizeWhitespace(mediaBody)).toBe(normalizeWhitespace(attrBody));
  });

  it('re-points the whole neutral ramp, so no step is left warm among cool ones', () => {
    for (const body of [mediaBody, attrBody]) {
      for (let step = 1; step <= 12; step++) {
        expect(() => readHexToken(body, `n-${step}`)).not.toThrow();
      }
    }
  });

  it('is actually navy — every surface step is blue-leaning, not warm', () => {
    // The whole point of the scope. A ramp that drifted back toward warm would
    // still pass every contrast assertion below while being the thing this
    // block exists to not be.
    for (const step of [1, 2, 3, 4, 5]) {
      const [r, , b] = channelsOfHex(readHexToken(attrBody, `n-${step}`));
      expect(b as number, `--n-${step} should be blue-leaning`).toBeGreaterThan(r as number);
    }
  });

  it('keeps the ramp ascending in luma from the ground to the text step', () => {
    // Dark mode inverts the light ramp's direction: n-1 is the darkest thing on
    // screen and n-12 the brightest. A step out of order is a card that reads
    // as recessed while sitting on top.
    let previous = -1;
    for (let step = 1; step <= 12; step++) {
      const luma = luminanceOfHex(readHexToken(attrBody, `n-${step}`));
      expect(luma, `--n-${step} is darker than --n-${step - 1}`).toBeGreaterThanOrEqual(previous);
      previous = luma;
    }
  });

  it('clears 4.5:1 for both text steps on every surface a card is built from', () => {
    for (const textStep of ['n-11', 'n-12'] as const) {
      const textLuma = luminanceOfHex(readHexToken(attrBody, textStep));
      for (const surface of SURFACE_STEPS) {
        const surfaceLuma = luminanceOfHex(readHexToken(attrBody, surface));
        expect(
          contrastRatio(textLuma, surfaceLuma),
          `--${textStep} on --${surface}`,
        ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
    }
  });

  it('re-measures every semantic token against the NAVY surfaces, not the warm ones', () => {
    // `--err` is the one that forced this: the global dark value
    // (oklch(0.62 0.20 25)) is tuned against #08090A and measures 4.28:1 on
    // this scope's `--n-3`. It is re-pointed inside the block; the rest are
    // asserted so the next surface tweak cannot quietly break one.
    for (const name of ['ok', 'err', 'warn', 'info'] as const) {
      const [L, C, H] = readOklchToken(attrBody, name);
      const luma = luminanceOfOklch(L, C, H);
      for (const surface of SURFACE_STEPS) {
        const surfaceLuma = luminanceOfHex(readHexToken(attrBody, surface));
        expect(
          contrastRatio(luma, surfaceLuma),
          `--${name} on --${surface}`,
        ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
    }
  });

  it('never re-points the amber accent — the action colour is the brand, in every room', () => {
    // The colour rule this whole surface rests on: "orange is what you press",
    // and it has to mean the same thing on the navy ground as on the warm one.
    // Re-pointing `--a-*` here is how the student's one learned signal breaks.
    for (const body of [mediaBody, attrBody]) {
      for (const step of ['a-9', 'a-10', 'a-11', 'a-12']) {
        expect(body, `--${step} must not be redefined in the study surface`).not.toMatch(
          new RegExp(`--${step}\\s*:`),
        );
      }
    }
  });
});

describe('the «خلصت» marker', () => {
  const attrBody = extract(ATTR_DARK);

  /**
   * Dichromat simulation (Viénot/Brettel, severity 1.0) in linear sRGB, and
   * ΔE as Euclidean distance in OKLab ×100 — the same measure and the same
   * floor of 8 that `packages/ui/src/tokens/viz.css` enumerated its palette
   * against.
   */
  const srgbToLms = (r: number, g: number, b: number): [number, number, number] => [
    0.31399022 * r + 0.63951294 * g + 0.04649755 * b,
    0.15537241 * r + 0.75789446 * g + 0.08670142 * b,
    0.01775239 * r + 0.10944209 * g + 0.87256922 * b,
  ];
  const lmsToSrgb = (l: number, m: number, s: number): [number, number, number] => [
    5.47221206 * l - 4.6419601 * m + 0.16963708 * s,
    -1.1252419 * l + 2.29317094 * m - 0.1678952 * s,
    0.02980165 * l - 0.19318073 * m + 1.16364789 * s,
  ];
  const deuteranopia = (r: number, g: number, b: number) => {
    const [l, m, s] = srgbToLms(r, g, b);
    return lmsToSrgb(l, 0.9513092 * l + 0.04866992 * s, s);
  };
  const protanopia = (r: number, g: number, b: number) => {
    const [l, m, s] = srgbToLms(r, g, b);
    return lmsToSrgb(1.05118294 * m - 0.05116099 * s, m, s);
  };

  const srgbToOklab = ([r, g, b]: number[]): [number, number, number] => {
    const [lr, lg, lb] = [r, g, b].map((v) => srgbToLinearChannel(v as number));
    const l = Math.cbrt(
      0.4122214708 * (lr as number) + 0.5363325363 * (lg as number) + 0.0514459929 * (lb as number),
    );
    const m = Math.cbrt(
      0.2119034982 * (lr as number) + 0.6806995451 * (lg as number) + 0.1073969566 * (lb as number),
    );
    const s = Math.cbrt(
      0.0883024619 * (lr as number) + 0.2817188376 * (lg as number) + 0.6299787005 * (lb as number),
    );
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };

  const channelsOfOklch = (L: number, C: number, H: number): number[] =>
    oklchToLinearSrgb(L, C, H).map(linearToSrgbChannel);

  const simulate = (
    channels: number[],
    sim?: (r: number, g: number, b: number) => [number, number, number],
  ): number[] =>
    sim
      ? sim(channels[0] as number, channels[1] as number, channels[2] as number)
          .map(linearToSrgbChannel)
      : channels;

  const deltaE = (
    a: number[],
    b: number[],
    sim?: (r: number, g: number, b: number) => [number, number, number],
  ): number => {
    const [al, aa, ab] = srgbToOklab(simulate(a, sim));
    const [bl, ba, bb] = srgbToOklab(simulate(b, sim));
    return Math.hypot(al - bl, aa - ba, ab - bb) * 100;
  };

  const CVD_SEPARATION_FLOOR = 8;

  it('stays separable from the quiz green under deuteranopia and protanopia', () => {
    /*
     * The design rule this negotiates: `--ok` green means "the quiz marked this
     * right" and is spent nowhere else (`study.css`, `color.css`). The
     * reference design marks a finished lecture in green, which would make one
     * hue carry two meanings two clicks apart.
     *
     * The settlement is teal — `--viz-2`, a colour the chart palette already
     * owns and that no status token uses. It only holds if a student who
     * cannot separate red from green can still separate THESE two, so that is
     * measured rather than asserted.
     */
    const teal = channelsOfOklch(...readOklchToken(attrBody, 'done-mark'));
    const green = channelsOfOklch(...readOklchToken(attrBody, 'ok'));

    expect(deltaE(teal, green), 'normal vision').toBeGreaterThanOrEqual(CVD_SEPARATION_FLOOR);
    expect(deltaE(teal, green, deuteranopia), 'deuteranopia').toBeGreaterThanOrEqual(
      CVD_SEPARATION_FLOOR,
    );
    expect(deltaE(teal, green, protanopia), 'protanopia').toBeGreaterThanOrEqual(
      CVD_SEPARATION_FLOOR,
    );
  });

  it('reads as text on the card it sits on', () => {
    const luma = luminanceOfOklch(...readOklchToken(attrBody, 'done-mark'));
    for (const surface of SURFACE_STEPS) {
      const surfaceLuma = luminanceOfHex(readHexToken(attrBody, surface));
      expect(
        contrastRatio(luma, surfaceLuma),
        `--done-mark on --${surface}`,
      ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });
});
