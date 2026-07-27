import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { color, motion, radius, space, type as typeScale } from './tokens';

const css = (name: string) =>
  readFileSync(join(import.meta.dirname, `${name}.css`), 'utf8');

/** Matches the media-query dark block's declaration body (inside `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }`). */
const MEDIA_DARK_BLOCK = /:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/s;
/** Matches the explicit, user-chosen dark block's declaration body (`:root[data-theme="dark"] { ... }`). */
const ATTR_DARK_BLOCK = /:root\[data-theme="dark"\]\s*\{([^}]*)\}/s;
/** Matches the plain `:root { ... }` block (the light theme — must not match `:root:not(...)` or `:root[...]`). */
const LIGHT_ROOT_BLOCK = /:root\s*\{([^}]*)\}/s;
/** Matches a top-level `:lang(en) { ... }` rule, but not `.eyebrow:lang(en) { ... }` — the
 * negative lookbehind excludes any occurrence directly preceded by a word character or dot. */
const LANG_EN_BLOCK = /(?<![\w.]):lang\(en\)\s*\{([^}]*)\}/s;

const extract = (source: string, pattern: RegExp): string | null =>
  source.match(pattern)?.[1] ?? null;

const normalizeWhitespace = (s: string): string => s.replace(/\s+/g, ' ').trim();

const hexToLuma = (hex: string): number => {
  const n = hex.replace('#', '');
  const r = Number.parseInt(n.slice(0, 2), 16);
  const g = Number.parseInt(n.slice(2, 4), 16);
  const b = Number.parseInt(n.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * I5 regression guard: resolves an `oklch(L C H)` declaration to a real WCAG
 * contrast ratio against a background hex, so a future edit that redarkens a
 * light-mode semantic token (or forgets to redefine one for dark mode, as
 * happened here) fails a test instead of shipping a countdown nobody can
 * read. Same OKLab math CSS Color 4 itself specifies — no external colour
 * library dependency for a 20-line check.
 */
function oklchToLinearSrgb(L: number, C: number, hueDeg: number): [number, number, number] {
  const h = (hueDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

const linearToSrgbChannel = (value: number): number => {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
};

const srgbToLinearChannel = (value: number): number =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

function relativeLuminanceOfOklch(L: number, C: number, hueDeg: number): number {
  const [r, g, b] = oklchToLinearSrgb(L, C, hueDeg).map(linearToSrgbChannel);
  return (
    0.2126 * srgbToLinearChannel(r as number) +
    0.7152 * srgbToLinearChannel(g as number) +
    0.0722 * srgbToLinearChannel(b as number)
  );
}

function relativeLuminanceOfHex(hex: string): number {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(n.slice(i, i + 2), 16) / 255);
  return (
    0.2126 * srgbToLinearChannel(r as number) +
    0.7152 * srgbToLinearChannel(g as number) +
    0.0722 * srgbToLinearChannel(b as number)
  );
}

function contrastRatio(lumA: number, lumB: number): number {
  const [hi, lo] = lumA > lumB ? [lumA, lumB] : [lumB, lumA];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pulls `--name: oklch(L C H);` triples out of a declaration block body. */
function readOklchToken(blockBody: string, name: string): [number, number, number] {
  const match = blockBody.match(
    new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`),
  );
  if (!match) throw new Error(`token --${name} not found`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function readHexToken(blockBody: string, name: string): string {
  const match = blockBody.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!match) throw new Error(`token --${name} not found`);
  return match[1] as string;
}

describe('design tokens', () => {
  it('exposes the pixel-named spacing scale from the spec', () => {
    expect(space).toEqual([2, 4, 8, 12, 16, 20, 24, 32, 48, 64, 80]);
  });

  it('never allows a card radius above 8px', () => {
    const cardRadii = [radius.xs, radius.sm, radius.md, radius.lg];
    for (const r of cardRadii) expect(r).toBeLessThanOrEqual(8);
    expect(radius.full).toBe(999);
  });

  it('gives Arabic body text 0.15 more line-height than Latin', () => {
    expect(typeScale.textBase.lineHeightAr - typeScale.textBase.lineHeightEn).toBeCloseTo(0.15, 5);
  });

  it('makes exits faster than entrances', () => {
    expect(motion.duration.exit).toBeLessThan(motion.duration.modal);
    expect(motion.duration.exit).toBeLessThan(motion.duration.popover);
  });

  it('caps every duration at 400ms', () => {
    for (const d of Object.values(motion.duration)) expect(d).toBeLessThanOrEqual(400);
  });

  it('never uses ease-in for an exit', () => {
    // ease-in curves start with a slow first control point (x1 high, y1 ~0).
    // Our exit curve must be an ease-out shape: y1 must exceed x1.
    const [x1, y1] = motion.easing.outNumbers;
    expect(y1).toBeGreaterThan(x1);
  });

  it('kills shadows in dark mode, in BOTH the media-query block and the explicit attribute block', () => {
    const colorCss = css('color');
    const mediaBody = extract(colorCss, MEDIA_DARK_BLOCK);
    const attrBody = extract(colorCss, ATTR_DARK_BLOCK);
    expect(mediaBody).not.toBeNull();
    expect(attrBody).not.toBeNull();
    for (const body of [mediaBody, attrBody] as string[]) {
      expect(body).toMatch(/--shadow-sm:\s*0 0 0 transparent/);
      expect(body).toMatch(/--shadow-md:\s*0 0 0 transparent/);
      expect(body).toMatch(/--shadow-lg:\s*0 0 0 transparent/);
    }
  });

  it('keeps the media-query dark block and the explicit dark block byte-identical (modulo whitespace)', () => {
    const colorCss = css('color');
    const mediaBody = extract(colorCss, MEDIA_DARK_BLOCK);
    const attrBody = extract(colorCss, ATTR_DARK_BLOCK);
    expect(mediaBody).not.toBeNull();
    expect(attrBody).not.toBeNull();
    expect(normalizeWhitespace(mediaBody as string)).toBe(normalizeWhitespace(attrBody as string));
  });

  it('never lets Arabic receive letter-spacing', () => {
    expect(css('typography')).toMatch(
      /\[lang="ar"\][^{]*\{[^}]*letter-spacing:\s*0\s*!important/s,
    );
  });

  it('zeroes Arabic letter-spacing via a zero-specificity :where([lang="ar"]) selector, never a bare [lang="ar"]', () => {
    // Regression guard (Task 6, fix round 1): a bare `[lang="ar"], [lang="ar"] *`
    // selector has specificity (0,1,0), which unconditionally beats the bare
    // tag selectors `code`/`kbd`/`samp`/`pre` (0,0,1) for EVERY element in the
    // app (every element is a descendant of `<html lang="ar">`), silently
    // stripping inline <code> of its intended Latin tracking. `:where(...)`
    // contributes zero specificity, so `code` etc. win decisively instead of
    // by source-order luck. If this regresses to a bare `[lang="ar"]` (no
    // `:where`), that bug is back.
    //
    // `[^{}]+` can't cross a `{` or `}`, so it isolates exactly the selector
    // text immediately preceding THIS declaration block (comments in between
    // contain no braces, so they're safely included in the capture without
    // ever matching across an unrelated rule).
    const typographyCss = css('typography');
    const rule = typographyCss.match(/([^{}]+)\{\s*letter-spacing:\s*0\s*!important;\s*\}/);
    expect(rule).not.toBeNull();
    const selectorText = (rule as RegExpMatchArray)[1] as string;
    expect(selectorText).toMatch(/:where\(\[lang="ar"\]\)/);
  });

  it('the dark base is exactly #08090A (--n-1 in the explicit dark block), never pure black', () => {
    const colorCss = css('color');
    const attrBody = extract(colorCss, ATTR_DARK_BLOCK) ?? '';
    const n1 = attrBody.match(/--n-1:\s*(#[0-9A-Fa-f]{6})/);
    expect(n1).not.toBeNull();
    expect((n1 as RegExpMatchArray)[1]!.toUpperCase()).toBe('#08090A');
  });

  it('keeps the light neutral ramp monotonically non-increasing in luma from n-1 to n-12', () => {
    const colorCss = css('color');
    const lightBody = extract(colorCss, LIGHT_ROOT_BLOCK) ?? '';
    const neutrals = [...lightBody.matchAll(/--n-(\d+):\s*(#[0-9A-Fa-f]{6})/g)]
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .map((m) => hexToLuma(m[2]!));
    expect(neutrals).toHaveLength(12);
    for (let i = 0; i < neutrals.length - 1; i++) {
      expect(neutrals[i]!).toBeGreaterThanOrEqual(neutrals[i + 1]!);
    }
  });

  it('never hardcodes a font-family the package cannot back with @font-face', () => {
    // Regression guard (final-review F1): this package has no `@font-face` for
    // "Plex Ar" / "Plex Mono" anywhere, and never can — it doesn't load font
    // files. Those literal family names were declared on an unlayered :root
    // here, which (per CSS Cascade §6.4.4) beats the app's real, loaded
    // `@theme inline` family mapping regardless of source order, so the whole
    // product silently rendered in the OS system font. Font FAMILIES are
    // owned by the consuming app (apps/web/lib/fonts.ts + globals.css); this
    // package only owns the type scale. If either literal reappears here,
    // this placeholder-wins-the-cascade bug is back.
    const typographyCss = css('typography');
    expect(typographyCss).not.toContain('"Plex Ar"');
    expect(typographyCss).not.toContain('"Plex Mono"');
  });

  it('provides a :lang(en) line-height override whose --lh-text-base matches tokens.ts lineHeightEn', () => {
    const typographyCss = css('typography');
    const langEnBody = extract(typographyCss, LANG_EN_BLOCK);
    expect(langEnBody).not.toBeNull();
    const match = (langEnBody as string).match(/--lh-text-base:\s*([\d.]+)/);
    expect(match).not.toBeNull();
    expect(Number((match as RegExpMatchArray)[1])).toBeCloseTo(typeScale.textBase.lineHeightEn, 5);
  });

  it('keeps the hex accent a faithful sRGB conversion of the OKLCH accent', () => {
    // oklch(0.770 0.152 72) → #EFA22C. Recompute if the accent ever moves;
    // a hand-picked hex silently desaturates the WebGL layer against the UI.
    expect(color.accentSolidHex).toMatch(/^#[0-9A-F]{6}$/);
    expect(color.accentSolidHex).toBe('#EFA22C');
    expect(color.accentSolid).toBe('oklch(0.770 0.152 72)');
  });
});

describe('semantic token contrast (I5)', () => {
  const colorCss = css('color');
  const lightBody = extract(colorCss, LIGHT_ROOT_BLOCK) ?? '';
  const mediaDarkBody = extract(colorCss, MEDIA_DARK_BLOCK) ?? '';
  const attrDarkBody = extract(colorCss, ATTR_DARK_BLOCK) ?? '';

  const MIN_TEXT_CONTRAST = 4.5;
  const SEMANTIC_TOKENS = ['ok', 'err', 'warn', 'info'] as const;

  it('every semantic token is declared in the light root AND both dark blocks', () => {
    for (const name of SEMANTIC_TOKENS) {
      expect(() => readOklchToken(lightBody, name)).not.toThrow();
      expect(() => readOklchToken(mediaDarkBody, name)).not.toThrow();
      expect(() => readOklchToken(attrDarkBody, name)).not.toThrow();
    }
  });

  it('clears 4.5:1 text contrast in LIGHT mode against every neutral surface (n-1..n-3) — the exam-countdown regression', () => {
    const n1 = relativeLuminanceOfHex(readHexToken(lightBody, 'n-1'));
    const n2 = relativeLuminanceOfHex(readHexToken(lightBody, 'n-2'));
    const n3 = relativeLuminanceOfHex(readHexToken(lightBody, 'n-3'));

    for (const name of SEMANTIC_TOKENS) {
      const [L, C, H] = readOklchToken(lightBody, name);
      const lum = relativeLuminanceOfOklch(L, C, H);
      for (const [surfaceName, surfaceLum] of [
        ['n-1', n1],
        ['n-2', n2],
        ['n-3', n3],
      ] as const) {
        expect(
          contrastRatio(lum, surfaceLum),
          `--${name} vs --${surfaceName} (light)`,
        ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
    }
  });

  it('clears 4.5:1 text contrast in DARK mode against n-1/n-2, in both dark blocks', () => {
    for (const body of [mediaDarkBody, attrDarkBody]) {
      const n1 = relativeLuminanceOfHex(readHexToken(body, 'n-1'));
      const n2 = relativeLuminanceOfHex(readHexToken(body, 'n-2'));
      for (const name of SEMANTIC_TOKENS) {
        const [L, C, H] = readOklchToken(body, name);
        const lum = relativeLuminanceOfOklch(L, C, H);
        expect(contrastRatio(lum, n1), `--${name} vs n-1 (dark)`).toBeGreaterThanOrEqual(
          MIN_TEXT_CONTRAST,
        );
        expect(contrastRatio(lum, n2), `--${name} vs n-2 (dark)`).toBeGreaterThanOrEqual(
          MIN_TEXT_CONTRAST,
        );
      }
    }
  });

  it('--a-11 (the text-accent-text step) clears 4.5:1 in light mode — --a-9 (solid) is not a text colour', () => {
    const n1 = relativeLuminanceOfHex(readHexToken(lightBody, 'n-1'));
    const [L, C, H] = readOklchToken(lightBody, 'a-11');
    const lum = relativeLuminanceOfOklch(L, C, H);
    expect(contrastRatio(lum, n1)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });
});
