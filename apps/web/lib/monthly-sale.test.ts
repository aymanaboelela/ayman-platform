import { describe, expect, it } from 'vitest';
import { monthlyForSaleCents } from './monthly-sale';

describe('monthlyForSaleCents', () => {
  it('is the price while the plan is on sale', () => {
    expect(monthlyForSaleCents({ monthlyPriceCents: 25000, monthlyOnSale: true })).toBe(25000);
  });

  it('is null when every month is closed — the price still stands, nothing is for sale', () => {
    expect(monthlyForSaleCents({ monthlyPriceCents: 25000, monthlyOnSale: false })).toBeNull();
  });

  it('reads a payload without the field as on sale — an older API, a cached entry', () => {
    expect(monthlyForSaleCents({ monthlyPriceCents: 25000 })).toBe(25000);
  });

  it('is null with no price, whatever the flag says', () => {
    expect(monthlyForSaleCents({ monthlyPriceCents: null, monthlyOnSale: true })).toBeNull();
  });
});
