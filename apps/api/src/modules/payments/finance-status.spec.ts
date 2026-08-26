import { EXPIRING_SOON_WINDOW_MS, financeStatusFor, monthRangeUTC } from './finance-status';

describe('financeStatusFor', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('is expired once validUntil is in the past', () => {
    expect(financeStatusFor(new Date('2026-06-15T11:59:59.000Z'), now)).toBe('expired');
    expect(financeStatusFor(new Date('2026-01-01T00:00:00.000Z'), now)).toBe('expired');
  });

  it('is expiring_soon inside the seven-day window, inclusive of the edge', () => {
    const edge = new Date(now.getTime() + EXPIRING_SOON_WINDOW_MS);
    expect(financeStatusFor(edge, now)).toBe('expiring_soon');
    expect(financeStatusFor(new Date(now.getTime() + 1000), now)).toBe('expiring_soon');
  });

  it('is active once validUntil is more than seven days out', () => {
    const justOutside = new Date(now.getTime() + EXPIRING_SOON_WINDOW_MS + 1000);
    expect(financeStatusFor(justOutside, now)).toBe('active');
    expect(financeStatusFor(new Date('2027-01-01T00:00:00.000Z'), now)).toBe('active');
  });
});

describe('monthRangeUTC', () => {
  it('returns the half-open [start, end) of the UTC calendar month', () => {
    const { start, end } = monthRangeUTC(new Date('2026-06-15T12:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('rolls over a December date into January of the next year', () => {
    const { start, end } = monthRangeUTC(new Date('2026-12-31T23:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
