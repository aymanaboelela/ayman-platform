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
  it('says delivery is free, and says nothing about «مرة واحدة», when EVERY zone is zero', () => {
    render(<BooksShippingChip rates={{ cairo_giza: 0, delta: 0, far: 0 }} />);

    expect(screen.getByText(copy.books.shippingFreeOnce)).toBeTruthy();
    // The old template must not survive anywhere in the rendered line: its
    // «مرة واحدة على الطلب كله» clause is the part that reads as nonsense here.
    expect(document.body.textContent).not.toContain('مرة واحدة');
    // And no bare zero, which is what `formatEGP(0)` produces.
    expect(document.body.textContent).not.toMatch(/(^|\D)0(\D|$)/);
  });

  it('quotes the CHEAPEST zone as a floor, and names all three under it', () => {
    render(<BooksShippingChip rates={{ cairo_giza: 8_000, delta: 10_000, far: 15_000 }} />);

    const text = document.body.textContent ?? '';
    // The floor — «من ٨٠» — and never الـ١٥٠ as the headline number.
    expect(text).toContain('80');
    // The clause earns its place when there IS a fee: it is what tells a
    // reader that a second book does not cost a second delivery.
    expect(text).toContain('مهما كان عدد الكتب');
    /*
     * THE regression this file now guards. A hero line that quotes one number
     * for a fee that has three is a price two thirds of the country meets as a
     * surprise at the address form — so the other two zones have to be on the
     * same line as the one it leads with.
     */
    expect(text).toContain('100');
    expect(text).toContain('150');
  });

  /*
   * «…مهما كان عدد الكتبالقاهرة والجيزة 80» — the headline and the zone list
   * used to be two strings in one inline run, and nothing separated them. Each
   * piece is its own element now, so the seam cannot come back unnoticed.
   */
  it('gives the rule and every zone their own element, so no two strings are glued', () => {
    render(<BooksShippingChip rates={{ cairo_giza: 8_000, delta: 10_000, far: 15_000 }} />);

    expect(screen.getByText(copy.books.shippingHeadline)).toBeTruthy();
    const zones = screen.getAllByRole('listitem');
    expect(zones).toHaveLength(3);
    expect(zones.map((zone) => zone.querySelector('.books-ship__zone-name')?.textContent)).toEqual([
      copy.books.shippingZoneNear,
      copy.books.shippingZoneDelta,
      copy.books.shippingZoneFar,
    ]);
    // Each row carries its OWN zone's price, not the floor three times.
    expect(zones.map((zone) => zone.querySelector('.books-money')?.textContent)).toEqual([
      '80',
      '100',
      '150',
    ]);
    expect(document.body.textContent).not.toContain('الكتبالقاهرة');
  });

  it('says «مجانًا» for a free zone, and drops the «بيبدأ من» floor when that floor is zero', () => {
    render(<BooksShippingChip rates={{ cairo_giza: 0, delta: 10_000, far: 15_000 }} />);

    // Still the zoned card — two zones are charged, so the «مرة واحدة» rule
    // is true and worth saying.
    expect(screen.getByText(copy.books.shippingHeadline)).toBeTruthy();
    expect(screen.getByText(copy.books.shippingFree)).toBeTruthy();
    // «بيبدأ من 0 ج» is not a floor, and a bare «0» reads as a price that
    // failed to load.
    expect(document.body.textContent).not.toContain('بيبدأ');
    expect(document.body.textContent).not.toMatch(/(^|\D)0(\D|$)/);
  });

  it('does not lead with a zone the reader might not be in', () => {
    render(<BooksShippingChip rates={{ cairo_giza: 8_000, delta: 10_000, far: 15_000 }} />);

    // «من» — stated as a floor. Without it the line promises ٨٠ ج to أسوان.
    expect(document.body.textContent ?? '').toContain('من');
  });
});
