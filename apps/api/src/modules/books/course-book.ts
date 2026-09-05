/**
 * «الكتاب بتاع الكورس ده» — ONE answer, for every surface that asks.
 *
 * ## Why this file exists
 *
 * Four services quote a course's book: the public catalogue (the course page
 * and the course cards), the dashboard's enrolled-course row, the player's
 * outline sidebar, and `BookOrdersService.priceCourseBook`, which is the one
 * that actually CHARGES. All four used to read `courses.book_title` /
 * `courses.book_price_cents` directly, and that was fine while those columns
 * were the only representation of a book.
 *
 * They are not any more. `app.books` is the catalogue the admin maintains —
 * cover, description, stock, discount, and a `course_id` linking each row back
 * — and nothing kept the two equal. An admin who repriced a book in the
 * catalogue changed what three screens DISPLAYED and not what the fourth
 * CHARGED. «توحدلي» is that gap, and closing it means the four callers cannot
 * each carry their own copy of the rule: three of them agreeing is exactly the
 * state that produced the bug.
 *
 * So: one predicate, one select, one place to delete when the ramp below ends.
 *
 * ## The three cases, and why the middle one is not the third
 *
 *   1. A LIVE catalogue row that is advertised on the course →  the book.
 *   2. A LIVE catalogue row with `showOnCourse: false` →  NOTHING.
 *      This is the admin answering the placement question — «الكتاب ده يتباع من
 *      قسم الكتب بس» — and it must not fall through to case 3. Falling through
 *      would advertise the book on the course page anyway, under its old legacy
 *      name and at whatever price that column was left at: the flag would be
 *      inert, and inert in the direction that costs money.
 *   3. No row, or one still `isActive: false` →  the legacy pair.
 *      ⚠️ `isActive: false` is NOT a placement answer. Nobody chose it per
 *      course: `20260902210000_books_backfill_inactive` set it for every row the
 *      first backfill had created, because that backfill had taken
 *      `courses.book_title` at face value — and on production those strings are
 *      CTA COPY, not names («حجز الكتاب هيتبعتلك لحد البيت» went on sale as the
 *      title of a 250 EGP book). Those courses still sell a real book through
 *      the legacy pair, and withdrawing their button to enforce a decision no
 *      human made would delete a working call to action from the live site.
 *
 * ## The ramp has an end, and it is checkable
 *
 * Once every linked row has a real title and is published, case 3 stops being
 * reachable and `courses.book_title` / `book_price_cents` can be dropped in one
 * migration. Until this returns nothing, they cannot:
 *
 *     SELECT c.id FROM app.courses c
 *       LEFT JOIN app.books b ON b.course_id = c.id
 *      WHERE c.book_title IS NOT NULL
 *        AND (b.id IS NULL OR NOT b.is_active);
 */

/** The catalogue columns every caller needs, and none it does not. */
export const COURSE_BOOK_SELECT = {
  id: true,
  titleAr: true,
  priceCents: true,
  isActive: true,
  showOnCourse: true,
} as const;

export interface CourseBookRow {
  id: string;
  titleAr: string;
  priceCents: number;
  isActive: boolean;
  showOnCourse: boolean;
}

export interface CourseBook {
  bookTitle: string | null;
  bookPriceCents: number | null;
  /**
   * The catalogue row the answer came from, when it came from one.
   *
   * `null` on the legacy branch — which is precisely what `book_order_items`
   * needs to know: a line for a legacy-priced course book has no catalogue row
   * to point at, and inventing one would attach an order to a book it was not
   * priced from.
   */
  bookId: string | null;
}

export function courseBook(row: {
  book: CourseBookRow | null;
  bookTitle: string | null;
  bookPriceCents: number | null;
}): CourseBook {
  const { book } = row;

  if (book?.isActive) {
    return book.showOnCourse
      ? { bookTitle: book.titleAr, bookPriceCents: book.priceCents, bookId: book.id }
      : { bookTitle: null, bookPriceCents: null, bookId: null };
  }

  return { bookTitle: row.bookTitle, bookPriceCents: row.bookPriceCents, bookId: null };
}
