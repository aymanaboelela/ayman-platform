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
 *
 * That framing outlived the change that prompted it: the paid line no longer
 * carries a number either, so BOTH cases here are now assertions about wording
 * alone.
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

  /*
   * ⚠️ This assertion was inverted on purpose, and it is worth saying why.
   *
   * It used to require the fee's NUMBER in the line («65»). Ayman took the
   * figure out of the shelf copy — the fee is a setting, the courier's price
   * moves, and a number printed across the top of the shop is where a stale one
   * reads as a promise. So the line now names delivery without pricing it, and
   * this test guards the new rule instead: no digits at all.
   *
   * What survives from the original intent is the half that was never about the
   * number — that the paid line still promises delivery is charged ONCE, which
   * is what tells a reader a second book does not cost a second delivery.
   */
  it('names delivery without pricing it, and keeps the «مرة واحدة» promise', () => {
    render(<BooksShippingChip shippingCents={6_500} />);

    const text = document.body.textContent ?? '';
    expect(text).toContain('مرة واحدة');
    // No figure anywhere — not the fee, not a stale one, not any digit. The
    // basket is where the amount is quoted.
    expect(text).not.toMatch(/\d/);
  });
});
