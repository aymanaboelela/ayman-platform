import { describe, expect, it } from 'vitest';
import { ACCENT_SLOTS, BrandingSchema, RESERVED_HUES, reservedHueConflict } from './settings';

/**
 * The brand hue is the one place an instructor's own colour reaches the page,
 * so it is also the one place a colour can collide with a colour that already
 * MEANS something. `--ok` (hue 150) and `--err` (hue 25) are how a student is
 * told whether an answer was right; a platform whose brand is that same green
 * is a platform where a wrong answer looks fine.
 */
describe('reservedHueConflict', () => {
  it('rejects the correct-answer green and the wrong-answer red', () => {
    expect(reservedHueConflict(150)).not.toBeNull();
    expect(reservedHueConflict(25)).not.toBeNull();
  });

  it('rejects the band around each, not just the exact value', () => {
    // «Nearly the correct-answer green» is the same problem.
    for (const hue of [132, 140, 160, 168]) {
      expect(reservedHueConflict(hue), `hue ${hue}`).not.toBeNull();
    }
    for (const hue of [8, 20, 30, 42]) {
      expect(reservedHueConflict(hue), `hue ${hue}`).not.toBeNull();
    }
  });

  it('wraps around 0/360 rather than treating them as far apart', () => {
    // Hue is a circle. 5 is 20° from 25, and a naive subtraction would call
    // 355 "330 degrees away" from 25 when it is 30.
    expect(reservedHueConflict(5)).not.toBeNull();
    expect(reservedHueConflict(355)).toBeNull();
    expect(reservedHueConflict(0)).toBeNull();
  });

  it('allows the hues the platform already ships', () => {
    // Amber 72, cyan 205, blue 258 — the shipped slots must stay expressible,
    // or this rule would be saying the current design is invalid.
    for (const hue of [72, 205, 258, 290, 330]) {
      expect(reservedHueConflict(hue), `hue ${hue}`).toBeNull();
    }
  });

  it('tolerates warn (85) and info (245), which are close to shipped accents', () => {
    // Deliberately NOT reserved: a warning banner looking brand-adjacent costs
    // nothing, and amber already sits 13° from warn on the live site.
    expect(reservedHueConflict(85)).toBeNull();
    expect(reservedHueConflict(245)).toBeNull();
  });

  it('names what the colour would collide with, so the error can say why', () => {
    expect(RESERVED_HUES.map((entry) => entry.meaning)).toEqual(['إجابة صح', 'إجابة غلط']);
  });
});

describe('BrandingSchema.accentHue', () => {
  const base = { accent: 'amber' as const, radius: 'default' as const };

  it('defaults to null, so every existing row keeps its slot', () => {
    const parsed = BrandingSchema.parse(base);

    expect(parsed.accentHue).toBeNull();
    expect(parsed.accent).toBe('amber');
  });

  it('accepts a hue in range', () => {
    expect(BrandingSchema.parse({ ...base, accentHue: 258 }).accentHue).toBe(258);
  });

  it('rejects a reserved hue with a message an admin can act on', () => {
    const result = BrandingSchema.safeParse({ ...base, accentHue: 150 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('إجابة صح');
    }
  });

  it('rejects out-of-range and non-integer hues', () => {
    for (const hue of [-1, 360, 400, 12.5]) {
      expect(BrandingSchema.safeParse({ ...base, accentHue: hue }).success, `${hue}`).toBe(false);
    }
  });

  it('still rejects an unknown key, because the schema is strict', () => {
    expect(BrandingSchema.safeParse({ ...base, accentHueDegrees: 200 }).success).toBe(false);
  });

  it('keeps every shipped slot valid alongside the new field', () => {
    for (const slot of ACCENT_SLOTS) {
      expect(BrandingSchema.safeParse({ ...base, accent: slot }).success, slot).toBe(true);
    }
  });
});
