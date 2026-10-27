import { describe, expect, it } from 'vitest';
import {
  addDays,
  cairoDay,
  calendarRange,
  fromCairoInput,
  isDay,
  shiftAnchor,
  suggestedSlot,
  toCairoInput,
  weekdayIndex,
} from './calendar';

describe('the studio calendar', () => {
  it('starts weeks on Saturday', () => {
    expect(weekdayIndex('2026-10-24')).toBe(0); // Saturday
    expect(weekdayIndex('2026-10-30')).toBe(6); // Friday
  });

  it('draws a week as seven Cairo days from Saturday', () => {
    const range = calendarRange('week', '2026-10-28');
    expect(range.days[0]).toBe('2026-10-24');
    expect(range.days).toHaveLength(7);
    // Saturday 00:00 in Cairo (UTC+3 in October 2026) is 21:00 UTC on Friday.
    expect(range.from.toISOString()).toBe('2026-10-23T21:00:00.000Z');
  });

  it('crosses the end of daylight saving without losing an hour of posts', () => {
    // Egypt leaves summer time on the last Thursday of October.
    const range = calendarRange('week', '2026-10-28');
    expect(range.to.getTime() - range.from.getTime()).toBe(7 * 24 * 3_600_000 + 3_600_000);
  });

  it('covers a month with whole weeks, inside the API window', () => {
    const range = calendarRange('month', '2026-10-15');
    expect(range.days.length % 7).toBe(0);
    expect(range.days[0]! <= '2026-10-01').toBe(true);
    expect(range.days.at(-1)! >= '2026-10-31').toBe(true);
    expect(weekdayIndex(range.days[0]!)).toBe(0);
    expect(range.to.getTime() - range.from.getTime()).toBeLessThanOrEqual(45 * 86_400_000);
  });

  it('pages by week and by month without skipping a short month', () => {
    expect(shiftAnchor('week', '2026-10-28', 1)).toBe('2026-11-04');
    expect(shiftAnchor('month', '2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftAnchor('month', '2026-01-10', -1)).toBe('2025-12-01');
  });

  it('round-trips a Cairo wall-clock input', () => {
    const at = fromCairoInput('2026-10-28T20:30')!;
    expect(at.toISOString()).toBe('2026-10-28T17:30:00.000Z');
    expect(toCairoInput(at.toISOString())).toBe('2026-10-28T20:30');
    expect(fromCairoInput('tomorrow')).toBeNull();
  });

  it('puts a late-night instant on the Cairo day, not the UTC one', () => {
    expect(cairoDay('2026-10-28T22:30:00.000Z')).toBe('2026-10-29');
  });

  it('suggests a slot inside the posting day', () => {
    expect(suggestedSlot(new Date('2026-10-28T02:10:00.000Z'))).toBe('2026-10-28T10:00');
    expect(suggestedSlot(new Date('2026-10-28T20:10:00.000Z'))).toBe('2026-10-29T10:00');
    expect(suggestedSlot(new Date('2026-10-28T12:00:00.000Z'))).toBe('2026-10-28T16:00');
  });

  it('validates day strings', () => {
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('2026-02-28')).toBe(true);
    expect(isDay(undefined)).toBe(false);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
