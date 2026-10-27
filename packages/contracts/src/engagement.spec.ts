import { describe, expect, it } from 'vitest';
import {
  BADGE_FAMILIES,
  bestStreak,
  currentStreak,
  daysBetween,
  daysInMonthKey,
  shiftDayKey,
  weekdayOf,
} from './engagement';

describe('day keys', () => {
  it('shifts across a month and a year boundary', () => {
    expect(shiftDayKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDayKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts whole days either way', () => {
    expect(daysBetween('2026-10-27', '2026-11-03')).toBe(7);
    expect(daysBetween('2026-11-03', '2026-10-27')).toBe(-7);
  });

  it('names the weekday of a calendar day, Sunday = 0', () => {
    expect(weekdayOf('2026-10-25')).toBe(0);
    expect(weekdayOf('2026-10-30')).toBe(5);
  });

  it('knows February in a leap year', () => {
    expect(daysInMonthKey('2028-02')).toBe(29);
    expect(daysInMonthKey('2026-02')).toBe(28);
  });
});

describe('streaks', () => {
  const days = new Set(['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-25', '2026-10-26']);

  it('keeps yesterday’s run alive while today is still open', () => {
    expect(currentStreak(days, '2026-10-27')).toBe(2);
  });

  it('counts today once it is answered', () => {
    expect(currentStreak(new Set([...days, '2026-10-27']), '2026-10-27')).toBe(3);
  });

  it('is zero once a whole day was missed', () => {
    expect(currentStreak(days, '2026-10-28')).toBe(0);
  });

  it('finds the longest run anywhere', () => {
    expect(bestStreak(days)).toBe(3);
    expect(bestStreak(new Set())).toBe(0);
  });
});

describe('badge catalog', () => {
  it('climbs on every ladder', () => {
    for (const family of BADGE_FAMILIES) {
      const [bronze, silver, gold] = family.targets;
      expect(bronze).toBeLessThan(silver);
      expect(silver).toBeLessThan(gold);
    }
  });
});
