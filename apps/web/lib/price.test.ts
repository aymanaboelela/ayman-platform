import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { formatEGP, formatShipping } from './price';

describe('formatEGP', () => {
  it('renders whole pounds in Western digits', () => {
    // `-u-nu-latn` — the platform's standing rule, so a price does not read in
    // a different digit system from the timestamp beside it.
    expect(formatEGP(25_000)).toBe('250');
  });
});

describe('formatShipping', () => {
  it('names a zero fee instead of printing a bare 0', () => {
    // The defect this exists for: «الشحن 0 جنيه» reads as a number that failed
    // to load, on a shop whose owner deliberately folded delivery into the
    // book's price.
    expect(formatShipping(0, copy.books.shippingFree)).toBe(copy.books.shippingFree);
    expect(formatShipping(0, copy.books.shippingFree)).not.toBe('0');
  });

  it('formats a real fee exactly as formatEGP does', () => {
    // The rows around it use `formatEGP`; a shipping row in a different format
    // from the subtotal above it is worse than no helper at all.
    expect(formatShipping(6_500, copy.books.shippingFree)).toBe(formatEGP(6_500));
  });
});
