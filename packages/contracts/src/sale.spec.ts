import { describe, expect, it } from 'vitest';
import { activeSalePrice } from './sale';

describe('activeSalePrice', () => {
  const now = new Date('2026-11-02T12:00:00Z');

  it('is the sale price while the offer is open-ended or not yet over', () => {
    expect(activeSalePrice(15000, 9900, null, now)).toBe(9900);
    expect(activeSalePrice(15000, 9900, '2026-11-10T00:00:00Z', now)).toBe(9900);
  });

  it('is nothing once the end date has passed', () => {
    expect(activeSalePrice(15000, 9900, '2026-11-01T00:00:00Z', now)).toBeNull();
    expect(activeSalePrice(15000, 9900, now, now)).toBeNull();
  });

  it('is nothing without a sale, without a regular price, or when it is no discount', () => {
    expect(activeSalePrice(15000, null, null, now)).toBeNull();
    expect(activeSalePrice(null, 9900, null, now)).toBeNull();
    expect(activeSalePrice(15000, 15000, null, now)).toBeNull();
  });
});
