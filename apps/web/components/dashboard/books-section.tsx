import Link from 'next/link';
import { copy } from '@ayman/contracts';
import type { BookCard } from '@ayman/contracts/books';
import { CourseArt } from '@/components/course-art';
import { formatEGP } from '@/lib/price';

const c = copy.dashboard;

/**
 * «الكتب» on the student's home screen.
 *
 * ## Why this is not `<BooksStrip>`
 *
 * That component is the landing page's, and it is built from `.site-*` classes
 * — `site-section`, `site-shell`, `site-h2`, `books-strip__grid`, `book-card`.
 * Every one of them lives in `(site)/styles/*.css`, which is imported by
 * `(site)/layout.tsx` and by nothing else: rendered inside the student shell
 * those class names resolve to nothing at all, and the section would come out
 * as unstyled text. Sharing it would have meant either dragging the marketing
 * stylesheet into the app bundle or writing a component that looks wrong in one
 * of the two places. This is the same split `<LibraryCourseCard>` documents
 * against `<CourseCard>`, for the same reason.
 *
 * ## Two shelves, not one grid
 *
 * «صور كتير ليها، عاوزها بشكل حلو تتعرض كويس، ويقدر يطلب الكتب، ويبقى في مكان
 * صغير كده في الكتب التانية يقدر يشتري كتب تانية بردو».
 *
 * So: the first two titles get a wide card each — cover beside the text, at a
 * size where the artwork on a real jacket is legible — and every remaining
 * title goes into a compact row underneath. Four equal thumbnails in a grid
 * treated the book a student is most likely to want exactly like the fourth
 * one, and at 3/4 in a quarter-column none of the covers was big enough to read
 * the subject off.
 *
 * ## Where a press goes
 *
 * `/books#book-{slug}` — the shop, scrolled to that exact title's card, where
 * the stepper, the basket and the checkout already live. Deliberately NOT a
 * second order flow keyed on a catalogue book: `BooksShop` owns quantities, the
 * one-fee-per-parcel shipping rule and the checkout dialog, and a second path
 * into the same API is the way those two quietly stop agreeing about a total.
 * `BookOrderButton` is not it either — that flow is keyed on a `courseId`, and
 * it is what the enrolled-course card renders.
 *
 * ## Why it takes its books as a prop
 *
 * The dashboard already awaits nine things in one `Promise.all`, including the
 * book catalogue (it needs `shippingCents` for the per-course «اطلب الكتاب»
 * button anyway). Fetching again here would add a tenth await on the critical
 * path of the heaviest page in the app to re-read a cache entry the caller is
 * already holding.
 *
 * ## Empty
 *
 * Renders nothing. A student whose shop has no stock this week should see the
 * page they saw last week, not a heading standing over an apology.
 */
export function BooksSection({ books }: { books: readonly BookCard[] }) {
  if (books.length === 0) return null;

  const featured = books.slice(0, 2);
  const rest = books.slice(2);

  return (
    <section>
      <div className="group-head">
        <span className="group-head__mark" aria-hidden="true" />
        <h2 className="group-head__title">{c.books}</h2>
        <Link href="/books" className="group-head__count hover:text-accent-text">
          {c.booksSeeAll}
        </Link>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {featured.map((book) => (
          <li key={book.id}>
            <Link
              href={`/books#book-${book.slug}`}
              className="panel flex gap-3 overflow-hidden p-3 transition-colors hover:border-line-strong"
            >
              {/* 3/4, matching the shop's own card: a book is taller than it is
                  wide, and the covers are photographs of one. `CourseArt` crops
                  rather than squashes, so the generated fallback fits too.
                  `w-24` fixed and the text flexible — a cover that shrinks with
                  the title length is the thing that made four of these read as
                  a contact sheet. */}
              <span className="relative block aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-[var(--r-sm)] bg-surface-3">
                <CourseArt
                  coverKey={book.coverKey}
                  subjectNameAr={book.titleAr}
                  seed={book.slug}
                  compact
                />
              </span>

              <span className="flex min-w-0 flex-1 flex-col">
                <span className="line-clamp-2 text-[length:var(--fs-text-base)] font-[var(--fw-medium)] text-fg">
                  {book.titleAr}
                </span>
                {book.subtitleAr ? (
                  <span className="mt-0.5 line-clamp-1 text-[length:var(--fs-text-sm)] text-fg-muted">
                    {book.subtitleAr}
                  </span>
                ) : null}

                <span className="mt-auto flex flex-col gap-2 pt-2">
                  <span className="flex items-baseline gap-2">
                    {/* The bare number, exactly as `/books` prints it — two
                        prices for one book, written two ways, is how a reader
                        starts doubting the total. */}
                    <span className="text-[length:var(--fs-title-4)] font-[var(--fw-bold)] text-accent-text">
                      {formatEGP(book.priceCents)}
                    </span>
                    {book.comparePriceCents !== null ? (
                      <span className="text-[length:var(--fs-text-sm)] text-fg-faint line-through">
                        {formatEGP(book.comparePriceCents)}
                      </span>
                    ) : null}
                  </span>

                  {/* A `<span>` and not a nested `<a>`/`<button>`: the whole
                      card is already one link, and a link inside a link is
                      invalid HTML — the browser closes the outer one at the
                      inner tag, which leaves the cover pointing nowhere. This
                      is what makes the card look pressable; the anchor is what
                      makes it pressable. */}
                  <span className="chip chip--accent w-full">{copy.landing.booksBuyNow}</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/*
        «كتب تانية» — small on purpose. It is a second shelf, not a second
        section, and it exists only when there is actually a third title.
      */}
      {rest.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-[length:var(--fs-text-sm)] font-[var(--fw-medium)] text-fg-muted">
            {c.booksMore}
          </p>
          <ul className="flex flex-wrap gap-2">
            {rest.map((book) => (
              <li key={book.id}>
                <Link
                  href={`/books#book-${book.slug}`}
                  className="flex items-center gap-2 rounded-[var(--r-md)] border border-line bg-surface-2 p-1.5 pe-3 transition-colors hover:border-line-strong"
                >
                  <span className="relative block aspect-[3/4] w-9 shrink-0 overflow-hidden rounded-[var(--r-xs)] bg-surface-3">
                    <CourseArt
                      coverKey={book.coverKey}
                      subjectNameAr={book.titleAr}
                      seed={book.slug}
                      compact
                    />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="line-clamp-1 max-w-[12rem] text-[length:var(--fs-text-sm)] text-fg">
                      {book.titleAr}
                    </span>
                    <span className="text-[length:var(--fs-text-sm)] font-[var(--fw-bold)] text-accent-text">
                      {formatEGP(book.priceCents)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
