import {
  amountCollectedCents,
  countsAsRevenue,
  EXPIRING_SOON_WINDOW_MS,
  financeStatusFor,
} from './finance-status';

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

describe('countsAsRevenue', () => {
  it('is true for an ordinary paid submission', () => {
    expect(countsAsRevenue({ isFree: false })).toBe(true);
  });

  it('is false for an admin-comped submission, regardless of amountCents', () => {
    expect(countsAsRevenue({ isFree: true })).toBe(false);
  });
});

describe('amountCollectedCents', () => {
  it('returns the plan price when the submission was paid', () => {
    expect(amountCollectedCents(50000, false)).toBe(50000);
  });

  it('returns zero for a comped term, regardless of the plan price', () => {
    expect(amountCollectedCents(50000, true)).toBe(0);
  });
});
