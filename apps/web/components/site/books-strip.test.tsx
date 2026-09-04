import { cleanup, render, screen } from '@testing-library/react';
import type { BookCard, BookCatalog } from '@ayman/contracts/books';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
  `<BooksStrip>` is an async server component: it awaits the catalogue and
  returns an element. `vi.mock` on the ONE module it reads is what makes it
  testable without a server — everything else about it (the flatten, the filter,
  the slice, the empty answer) is pure, and those are exactly the parts worth
  pinning.

  Hoisted mock, so the import below already sees it.
*/
const getBookCatalogOrEmpty = vi.fn<() => Promise<BookCatalog>>();

vi.mock('@/lib/books', () => ({
  getBookCatalogOrEmpty: () => getBookCatalogOrEmpty(),
}));

/* The generated jacket resolves a storage key through `next/image`, which has
   nothing to say about placement. A stub keeps this file about the one
   decision it is testing. */
vi.mock('@/components/course-art', () => ({
  CourseArt: () => null,
}));

const { BooksStrip } = await import('./books-strip');

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  getBookCatalogOrEmpty.mockReset();
});

function book(n: number, overrides: Partial<BookCard> = {}): BookCard {
  return {
    id: `1111111${n}-1111-4111-8111-111111111111`,
    slug: `book-${n}`,
    titleAr: `كتاب رقم ${n}`,
    subtitleAr: null,
    coverKey: null,
    descriptionAr: null,
    priceCents: 25000,
    comparePriceCents: null,
    pageCount: null,
    term: 'first',
    year: 2,
    inStock: true,
    forGeneral: true,
    forLanguages: true,
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

/** Renders the async server component the way React would await it. */
async function renderStrip(catalog: BookCatalog, limit?: number) {
  getBookCatalogOrEmpty.mockResolvedValue(catalog);
  return render(await BooksStrip(limit === undefined ? {} : { limit }));
}

describe('BooksStrip', () => {
  /**
   * ⚠️ The ORDER of `.filter()` and `.slice()` is the whole test.
   *
   * Filtering the sliced array instead reads identically and is wrong: it takes
   * the first three books in catalogue order and then throws away the
   * unadvertised ones, so a shop with two unflagged titles at the top renders a
   * one-card strip on the home page. Nothing errors, nothing logs, and the
   * section just looks half-loaded.
   *
   * Four books, the first two hidden, a limit of two: the correct code shows
   * books 3 and 4, and the transposed code shows nothing at all.
   */
  it('fills the strip from the advertised books, not from the first N', async () => {
    await renderStrip(
      catalogOf(
        book(1, { showOnLanding: false }),
        book(2, { showOnLanding: false }),
        book(3),
        book(4),
      ),
      2,
    );

    expect(screen.queryByText(book(1).titleAr)).toBeNull();
    expect(screen.queryByText(book(2).titleAr)).toBeNull();
    expect(screen.getByText(book(3).titleAr)).toBeTruthy();
    expect(screen.getByText(book(4).titleAr)).toBeTruthy();
  });

  /**
   * A shop whose every title has been taken off the landing page is a
   * deliberate state, not a failure — so the section stands down entirely,
   * exactly as it does for an empty catalogue. A heading over an empty grid
   * would read as a page that failed to load.
   */
  it('renders nothing when no book is advertised', async () => {
    const { container } = await renderStrip(
      catalogOf(book(1, { showOnLanding: false }), book(2, { showOnLanding: false })),
    );

    expect(container.innerHTML).toBe('');
  });
});
