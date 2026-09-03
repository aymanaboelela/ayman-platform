import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { copy } from '@ayman/contracts';
import type { BookCard, BookCatalog } from '@ayman/contracts/books';
import { afterEach, describe, expect, it } from 'vitest';
import { BooksShop } from './books-shop';

// Explicit, as every component test in this repo does it — `vitest.setup.ts`
// registers no automatic cleanup.
afterEach(() => {
  cleanup();
});

const COVER = 'ab/abcdef01-2345-6789-abcd-ef0123456789.webp';

function book(overrides: Partial<BookCard> = {}): BookCard {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'programming-y2-ar',
    titleAr: 'كتاب تانية بكالوريا برمجة عربي',
    subtitleAr: null,
    coverKey: COVER,
    descriptionAr: null,
    priceCents: 25000,
    comparePriceCents: null,
    pageCount: null,
    term: 'first',
    year: 2,
    inStock: true,
    ...overrides,
  };
}

const catalog: BookCatalog = {
  shelves: [
    {
      subjectId: null,
      subjectNameAr: 'البرمجة وعلوم الحاسب',
      subjectSlug: null,
      first: [book()],
      second: [],
      full: [],
    },
  ],
  shippingCents: 0,
  total: 1,
};

describe('BooksShop', () => {
  /**
   * The covers are photographs of a printed jacket, stored at 1023×1537, and
   * they went out over `sizes="128px"` — `CourseArt`'s thumbnail default, which
   * this card inherited by asking for `compact` (it wants the CROP). A 128px
   * file stretched across a 20rem track is «الكواليتي وحشة جدا وأنا رافعها فل
   * كواليتي», and nothing about it is visible in a DOM without a layout engine
   * except the attribute itself.
   */
  it('asks for a cover wide enough for the card, not a thumbnail', () => {
    const { container } = render(<BooksShop catalog={catalog} vodafoneCash={null} />);

    const cover = container.querySelector('.book-card__art img');
    expect(cover).not.toBeNull();
    expect(cover?.getAttribute('sizes')).toBe('20rem');
  });

  /**
   * «خليها فوق لأن هي تحت ومستخبية» — the phone basket used to be fixed to the
   * bottom edge, where the assistant's floating button covered its «كمّل الطلب».
   * `position: sticky` only puts it under the header if it is also ABOVE the
   * shelves in the document, so the order is the fix and is asserted here; a
   * CSS-only change would look right in review and still render at the bottom.
   */
  it('puts the phone basket above the shelves once a book is added', () => {
    const { container } = render(<BooksShop catalog={catalog} vodafoneCash={null} />);

    expect(container.querySelector('.books-bar')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: copy.books.add }));

    const bar = container.querySelector('.books-bar');
    const shelves = container.querySelector('.books-layout');
    expect(bar).not.toBeNull();
    expect(shelves).not.toBeNull();
    // `DOCUMENT_POSITION_FOLLOWING` — the shelves come after the bar.
    expect(bar?.compareDocumentPosition(shelves as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });
});
