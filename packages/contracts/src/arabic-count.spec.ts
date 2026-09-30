import { describe, expect, it } from 'vitest';
import { arabicCount } from './arabic-count';

const LECTURES = { one: 'محاضرة واحدة', two: 'محاضرتين', few: '{count} محاضرات', many: '{count} محاضرة' };

describe('arabicCount', () => {
  it('says each number the way it is said', () => {
    expect(arabicCount(1, LECTURES)).toBe('محاضرة واحدة');
    expect(arabicCount(2, LECTURES)).toBe('محاضرتين');
    expect(arabicCount(3, LECTURES)).toBe('3 محاضرات');
    expect(arabicCount(10, LECTURES)).toBe('10 محاضرات');
    expect(arabicCount(11, LECTURES)).toBe('11 محاضرة');
    expect(arabicCount(25, LECTURES)).toBe('25 محاضرة');
  });

  it('reads the last two digits past a hundred', () => {
    expect(arabicCount(103, LECTURES)).toBe('103 محاضرات');
    expect(arabicCount(111, LECTURES)).toBe('111 محاضرة');
  });
});
