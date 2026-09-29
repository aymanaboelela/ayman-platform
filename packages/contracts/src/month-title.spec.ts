import { describe, expect, it } from 'vitest';
import { defaultMonthTitle } from './month-title';
import { copy } from './copy/admin';

describe('defaultMonthTitle', () => {
  it('names months by ordinal, never by number', () => {
    expect(defaultMonthTitle(1)).toBe('الشهر الأول');
    expect(defaultMonthTitle(2)).toBe('الشهر الثاني');
    expect(defaultMonthTitle(3)).toBe('الشهر الثالث');
    expect(defaultMonthTitle(10)).toBe('الشهر العاشر');
    expect(defaultMonthTitle(12)).toBe('الشهر الثاني عشر');
  });

  it('is the name the first month is given by «خلّي الكورس بالشهور»', () => {
    expect(copy.admin.month.firstMonthTitle).toBe(defaultMonthTitle(1));
  });

  it('never prints «undefined» outside the column CHECK', () => {
    expect(defaultMonthTitle(13)).toBe('الشهر 13');
  });
});
