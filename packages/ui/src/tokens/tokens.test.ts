import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { motion, radius, space, type as typeScale } from './tokens.js';

const css = (name: string) =>
  readFileSync(join(import.meta.dirname, `${name}.css`), 'utf8');

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

  it('kills shadows in dark mode', () => {
    const colorCss = css('color');
    const darkBlock = colorCss.slice(colorCss.indexOf('[data-theme="dark"]'));
    expect(darkBlock).toMatch(/--shadow-sm:\s*0 0 0 transparent/);
    expect(darkBlock).toMatch(/--shadow-md:\s*0 0 0 transparent/);
    expect(darkBlock).toMatch(/--shadow-lg:\s*0 0 0 transparent/);
  });

  it('never lets Arabic receive letter-spacing', () => {
    expect(css('typography')).toMatch(
      /\[lang="ar"\][^{]*\{[^}]*letter-spacing:\s*0\s*!important/s,
    );
  });

  it('uses a near-black with a blue lean, never pure black', () => {
    const colorCss = css('color');
    expect(colorCss).toContain('#08090A');
    expect(colorCss).not.toMatch(/--n-1:\s*#000000/i);
  });
});
