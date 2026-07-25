import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { motion, radius, space, type as typeScale } from './tokens.js';

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

  it('provides a :lang(en) line-height override whose --lh-text-base matches tokens.ts lineHeightEn', () => {
    const typographyCss = css('typography');
    const langEnBody = extract(typographyCss, LANG_EN_BLOCK);
    expect(langEnBody).not.toBeNull();
    const match = (langEnBody as string).match(/--lh-text-base:\s*([\d.]+)/);
    expect(match).not.toBeNull();
    expect(Number((match as RegExpMatchArray)[1])).toBeCloseTo(typeScale.textBase.lineHeightEn, 5);
  });
});
