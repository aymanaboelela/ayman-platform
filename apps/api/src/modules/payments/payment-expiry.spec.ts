import { addMonthsClamped, computeApprovalValidUntil } from './payment-expiry';

describe('addMonthsClamped', () => {
  it('adds one month to an ordinary date', () => {
    const result = addMonthsClamped(new Date('2026-03-10T00:00:00.000Z'), 1);
    expect(result.toISOString()).toBe('2026-04-10T00:00:00.000Z');
  });

  it('adds three months for the quarterly plan', () => {
    const result = addMonthsClamped(new Date('2026-01-15T00:00:00.000Z'), 3);
    expect(result.toISOString()).toBe('2026-04-15T00:00:00.000Z');
  });

  it('clamps 31 Jan + 1 month to the last day of February in a non-leap year', () => {
    const result = addMonthsClamped(new Date('2027-01-31T00:00:00.000Z'), 1);
    expect(result.toISOString()).toBe('2027-02-28T00:00:00.000Z');
  });

  it('clamps 31 Jan + 1 month to 29 Feb in a leap year', () => {
    const result = addMonthsClamped(new Date('2028-01-31T00:00:00.000Z'), 1);
    expect(result.toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });

  it('clamps a quarterly renewal that lands on a short month', () => {
    // 30 Nov + 3 months would naively be 28/29 Feb + 1 day = 1 Mar; the real
    // target month (February) only has 28 days in 2026.
    const result = addMonthsClamped(new Date('2026-11-30T00:00:00.000Z'), 3);
    expect(result.toISOString()).toBe('2027-02-28T00:00:00.000Z');
  });
});

describe('computeApprovalValidUntil', () => {
  const now = new Date('2026-06-15T00:00:00.000Z');

  it('extends from now for a brand new subscription (no existing grant)', () => {
    const result = computeApprovalValidUntil('monthly', now, null);
    expect(result.toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });

  it('renew-before-expiry: extends from the CURRENT expiry, not from today', () => {
    // Still has three weeks left on the current term.
    const existingValidUntil = new Date('2026-07-06T00:00:00.000Z');
    const result = computeApprovalValidUntil('monthly', now, existingValidUntil);
    // One month added ON TOP of the remaining term, not one month from today.
    expect(result.toISOString()).toBe('2026-08-06T00:00:00.000Z');
  });

  it('renew-before-expiry on the quarterly plan adds three months onto the remainder', () => {
    const existingValidUntil = new Date('2026-06-20T00:00:00.000Z');
    const result = computeApprovalValidUntil('quarterly', now, existingValidUntil);
    expect(result.toISOString()).toBe('2026-09-20T00:00:00.000Z');
  });

  it('renew-after-expiry: extends from NOW, discarding the lapsed date', () => {
    // The old term ended two weeks ago.
    const existingValidUntil = new Date('2026-06-01T00:00:00.000Z');
    const result = computeApprovalValidUntil('monthly', now, existingValidUntil);
    expect(result.toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });

  it('treats an expiry equal to `now` as already lapsed (extends from now)', () => {
    const result = computeApprovalValidUntil('monthly', now, now);
    expect(result.toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });
});
