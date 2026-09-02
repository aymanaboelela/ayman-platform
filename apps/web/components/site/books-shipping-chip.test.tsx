import { cleanup, render, screen } from '@testing-library/react';
import { copy } from '@ayman/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { BooksShippingChip } from './books-shop';

// Explicit, as every component test in this repo does it — `vitest.setup.ts`
// registers no automatic cleanup.
afterEach(() => {
  cleanup();
});

/**
 * The shop's hero line, and the one this change is actually about.
 *
 * A zero delivery fee is a CHOSEN configuration — «مصاريف الشحن ملهاش دعوة…
 * السعر ٢٥٠» means the price already covers the courier — and the old line
 * rendered it by substitution: «الشحن ٠ ج مرة واحدة على الطلب كله — مهما كان
 * عدد الكتب». That sentence spends its whole second half promising a fee is
 * charged only once, about a fee that is not charged at all.
 *
 * `lib/price.test.ts` covers the helper; this covers the sentence, because the
 * defect was never in the number — it was in the words around it.
 */
describe('BooksShippingChip', () => {
  it('says delivery is free, and says nothing about «مرة واحدة», at zero', () => {
    render(<BooksShippingChip shippingCents={0} />);

    expect(screen.getByText(copy.books.shippingFreeOnce)).toBeTruthy();
    // The old template must not survive anywhere in the rendered line: its
    // «مرة واحدة على الطلب كله» clause is the part that reads as nonsense here.
    expect(document.body.textContent).not.toContain('مرة واحدة');
    // And no bare zero, which is what `formatEGP(0)` produces.
    expect(document.body.textContent).not.toMatch(/(^|\D)0(\D|$)/);
  });

  it('still quotes a real fee with the «مرة واحدة» promise intact', () => {
    render(<BooksShippingChip shippingCents={6_500} />);

    const text = document.body.textContent ?? '';
    expect(text).toContain('65');
    // The clause earns its place when there IS a fee: it is what tells a
    // reader that a second book does not cost a second delivery.
    expect(text).toContain('مهما كان عدد الكتب');
  });
});
