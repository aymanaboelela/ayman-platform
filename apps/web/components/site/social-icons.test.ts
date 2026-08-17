import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOCIAL_MARKS, inkBrand, type SocialMark } from './social-icons';

/**
 * A brand mark has to survive the surface it is drawn on, and one of them did
 * not: TikTok's official colour is `#000000`, the links page paints its marks
 * on `--ink` — the panel that stays dark in both themes — and black on
 * near-black is not a subtle contrast problem, it is a missing icon. It shipped
 * that way and was reported as «التيك توك اسود اوي».
 *
 * axe cannot catch this. Every one of these glyphs is `aria-hidden` with the
 * accessible name on the surrounding link, which is correct — and it means an
 * automated a11y pass has, correctly, nothing to say about their colour. So the
 * fact is pinned here instead, as arithmetic.
 */

/** WCAG 2.1 §1.4.11 — the bar for a graphical object that carries meaning. */
const NON_TEXT_CONTRAST = 3;

function srgbFromOklch(lightness: number, chroma: number, hueDeg: number): [number, number, number] {
  const hue = (hueDeg * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.089484178 * a - 1.291485548 * b) ** 3;

  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  return linear.map((v) => {
    const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(encoded * 255)));
  }) as [number, number, number];
}

function srgbFromHex(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Read from the stylesheet rather than restated here. A duplicated colour is a
 * test that keeps passing after the thing it describes has moved.
 */
function inkFromTokens(): [number, number, number] {
  const css = readFileSync(
    path.join(__dirname, '../../../../packages/ui/src/tokens/color.css'),
    'utf8',
  );
  const match = css.match(/--ink:\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
  if (!match) throw new Error('`--ink` is no longer an oklch() triple in color.css');
  return srgbFromOklch(Number(match[1]), Number(match[2]), Number(match[3]));
}

describe('social marks on the always-dark ink panel', () => {
  const ink = inkFromTokens();

  it.each(Object.entries(SOCIAL_MARKS))(
    '%s is legible on --ink once inkBrand() has had its say',
    (_key, mark: SocialMark) => {
      expect(contrast(srgbFromHex(inkBrand(mark)), ink)).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
    },
  );

  it('is not vacuous: TikTok fails the same check on its own official colour', () => {
    // If this ever passes, `--ink` has been lightened enough that `inkHex` is
    // dead weight — delete the override rather than leaving a rule that no
    // longer does anything.
    expect(contrast(srgbFromHex(SOCIAL_MARKS.tiktok.hex), ink)).toBeLessThan(NON_TEXT_CONTRAST);
    expect(SOCIAL_MARKS.tiktok.inkHex).toBe('#25F4EE');
  });

  it('leaves marks that were already legible untouched', () => {
    // `inkHex` is an escape hatch, not a palette. Anything that reads fine on
    // ink keeps the brand's real colour, so the row stays recognisably theirs.
    for (const key of ['youtube', 'instagram', 'facebook', 'whatsapp'] as const) {
      expect(SOCIAL_MARKS[key]).not.toHaveProperty('inkHex');
      expect(inkBrand(SOCIAL_MARKS[key])).toBe(SOCIAL_MARKS[key].hex);
    }
  });
});
