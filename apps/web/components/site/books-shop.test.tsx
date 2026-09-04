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
    forGeneral: true,
    forLanguages: false,
    // `true` is the catalogue default — every book is advertised until an
    // admin says otherwise. The shop must render it identically either way,
    // which the last test in this file is what proves.
    showOnLanding: true,
    ...overrides,
  };
}

function catalogOf(...books: BookCard[]): BookCatalog {
  return {
    shelves: [
      {
        subjectId: null,
        subjectNameAr: 'البرمجة وعلوم الحاسب',
        subjectSlug: null,
        first: books,
        second: [],
        full: [],
      },
    ],
    shippingCents: 0,
    total: books.length,
  };
}

const catalog = catalogOf(book());

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

  /**
   * The شرح book and the لغات edition of one subject are two rows with nearly
   * the same title, the same generated cover and often the same price. Before
   * this chip the only thing separating them on the shelf was a word inside the
   * title, and getting it wrong costs a student the shipping fee twice.
   *
   * Asserted on the RENDERED WORDS from `copy.stream`, not on a class name: the
   * point is that a reader can tell the two apart, and `<StreamBadge>` is what
   * decides how they read.
   */
  it('labels a book with its stream, so the لغات edition is not the عربي one', () => {
    render(
      <BooksShop
        catalog={catalogOf(book({ forGeneral: false, forLanguages: true }))}
        vodafoneCash={null}
      />
    );

    expect(screen.getByText(copy.stream.languages)).toBeTruthy();
    expect(screen.queryByText(copy.stream.general)).toBeNull();
  });

  /**
   * ⚠️ Placement is not visibility.
   *
   * `showOnLanding` decides whether `<BooksStrip>` may advertise a title on the
   * home page. It says nothing about whether the book is for sale — that is
   * `isActive`, applied by the API before this payload exists. Reading the flag
   * here would be an easy and invisible mistake: the book would vanish from the
   * shop, every `/books#book-{slug}` link ever shared for it would land on a
   * page without it, and no error would be raised anywhere.
   */
  it('sells a book that is not advertised on the landing page', () => {
    const hidden = book({ showOnLanding: false, titleAr: 'كتاب مش في الواجهة' });

    render(<BooksShop catalog={catalogOf(hidden)} vodafoneCash={null} />);

    expect(screen.getByText(hidden.titleAr)).toBeTruthy();
    // Not merely present — buyable. A card rendered with no «ضيفه» on it would
    // pass a text assertion and still be a shop nobody can order from.
    expect(screen.getByRole('button', { name: copy.books.add })).toBeTruthy();
  });
});
