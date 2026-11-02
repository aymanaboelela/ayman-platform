import { describe, expect, it } from 'vitest';
import { saleDayOf, saleEndOfDayIso } from './sale-day';

describe('sale day', () => {
  it('ends an offer at the last second of the Cairo day', () => {
    // Cairo is UTC+2 in November.
    expect(saleEndOfDayIso('2026-11-10')).toBe('2026-11-10T21:59:59.000Z');
    // …and UTC+3 in summer.
    expect(saleEndOfDayIso('2026-07-10')).toBe('2026-07-10T20:59:59.000Z');
  });

  it('reads the day back for the date field', () => {
    expect(saleDayOf('2026-11-10T21:59:59.000Z')).toBe('2026-11-10');
    expect(saleDayOf(null)).toBe('');
  });

  it('refuses anything that is not a day', () => {
    expect(saleEndOfDayIso('')).toBeNull();
    expect(saleEndOfDayIso('10/11/2026')).toBeNull();
  });
});
