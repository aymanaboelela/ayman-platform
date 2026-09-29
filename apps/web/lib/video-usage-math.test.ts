import { describe, expect, it } from 'vitest';
import { monthlyAtCurrentStorage, priceMultiplier } from './video-usage-math';

/**
 * «لصبري وعادل تزوّد الضعف على السعر بتاع الجيجا» — a teacher pays twice what
 * the bucket costs the owner; the owner's own row is the cost itself.
 */
describe('what a teacher is charged', () => {
  it('is twice the cost for a teacher, the cost for the owner', () => {
    expect(priceMultiplier('adel')).toBe(2);
    expect(priceMultiplier('sabry')).toBe(2);
    expect(priceMultiplier('ayman')).toBe(1);
  });

  it('prices a full month at what is stored now — 100 GB is $3.00 to a teacher, $1.50 at cost', () => {
    expect(monthlyAtCurrentStorage(100e9, 'adel')).toBeCloseTo(3);
    expect(monthlyAtCurrentStorage(100e9, 'ayman')).toBeCloseTo(1.5);
    expect(monthlyAtCurrentStorage(0, 'adel')).toBe(0);
  });
});
