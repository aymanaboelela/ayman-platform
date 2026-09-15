import Link from 'next/link';
import type { BookCard } from '@ayman/contracts/books';
import { getBookCatalogOrEmpty } from '@/lib/books';
import { CourseArt } from '@/components/course-art';
import { formatEGP } from '@/lib/price';
import { BoardHeading } from './board-heading';
import { boardCopy } from './board-copy';

/**
 * «الكتب» — the printed shop's strip on «اللوح».
 *
 * ## ⚠️ THIS one DOES stand down when empty, and the course grid does not
 *
 * The two look like the same decision and they are opposite ones, so the
 * difference is stated here rather than left to be rediscovered.
 *
 * A teaching platform with no COURSES is a platform that has not started yet.
 * Every visitor came for lessons, so the page owes them a sentence about when
 * the lessons arrive — which is why `<BoardCourses>` replaces its grid with a
 * designed slab instead of disappearing.
 *
 * A platform with no BOOKS is just a platform that does not sell books, and
 * most never will. Nobody arrived expecting a printed book, nothing was
 * promised, and «لسه مفيش كتب» announces the absence of a product that was
 * never offered — a heading over a hole, which is the reading `<BooksStrip>`
 * rejects for exactly this case. So the section renders nothing.
 *
 * The same answer covers three states that are indistinguishable from here and
 * do not need to be told apart: no books at all, every book taken off the
 * landing page with `showOnLanding`, and an API that could not be reached
 * (`getBookCatalogOrEmpty` never throws — it costs this section rather than
 * the page).
 *
 * ## The `showOnLanding` filter runs BEFORE the slice
 *
 * Lifted from `<BooksStrip>` along with its warning: filtering the sliced
 * array instead takes the first N books in catalogue order and then throws
 * away whichever of them are unadvertised, so a shop with twenty books and two
 * unflagged ones at the top renders a one-card strip. The reader sees a
 * section that looks half-loaded and nothing in the payload says why.
 *
 * Placement is not visibility: `showOnLanding` decides whether a book is
 * ADVERTISED here, `isActive` (applied by the API before this payload is
 * built) decides whether it is on sale at all. `/books` reads neither and sells
 * everything; this is the only surface that reads the first.
 */
export async function BoardBooks({
  title,
  lead,
  ctaLabel,
  limit,
  level,
}: {
  title: string;
  lead: string;
  ctaLabel: string;
  limit: number;
  level: 1 | 2;
}) {
  const catalog = await getBookCatalogOrEmpty();

  const books: BookCard[] = catalog.shelves
    .flatMap((shelf) => [...shelf.first, ...shelf.second, ...shelf.full])
    .filter((book) => book.showOnLanding)
    .slice(0, limit);

  if (books.length === 0) return null;

  return (
    <section className="board-band" id="books">
      <div className="board-shell">
        <BoardHeading chip={boardCopy.books.chip} title={title} lead={lead} level={level} />

        <ul className="board-books" role="list">
          {books.map((book) => (
            <li className="board-book" key={book.id}>
              {/*
                ONE anchor around the whole card — see `<BoardYears>`'s note on
                why a link inside a link silently detaches the outer one — and
                it goes to `/books#book-{slug}`, the shop scrolled to THIS
                title's card, where the stepper and the checkout actually live.
              */}
              <Link className="board-book__link" href={`/books#book-${book.slug}`}>
                <span className="board-book__art">
                  {/*
                    Jackets are 3:4 and carry their own title across the
                    artwork, so `compact` is passed for the CROP — and its
                    `128px` default `sizes` is overridden, because that default
                    was written for an 8rem thumbnail and this track is 14rem.
                    A 128px file stretched into a 14rem box is the «الكواليتي
                    وحشة» report `<CourseArt>`'s own prop documents.
                  */}
                  <CourseArt
                    coverKey={book.coverKey}
                    subjectNameAr={book.titleAr}
                    seed={book.slug}
                    compact
                    sizes="(min-width: 44rem) 14rem, 45vw"
                  />
                </span>

                <span className="board-book__body">
                  <span className="board-book__title">{book.titleAr}</span>
                  {book.subtitleAr ? (
                    <span className="board-book__subtitle">{book.subtitleAr}</span>
                  ) : null}

                  <span className="board-book__price-row">
                    {/* The bare number, exactly as `/books` prints it. The shop
                        writes no currency word beside a book price and this
                        strip must not either — two prices for the same book,
                        written two ways, one click apart. */}
                    <span className="board-book__price tabular-nums">
                      {formatEGP(book.priceCents)}
                    </span>
                    {book.comparePriceCents !== null ? (
                      <span className="board-book__was tabular-nums">
                        {formatEGP(book.comparePriceCents)}
                      </span>
                    ) : null}
                  </span>

                  {/* A `<span>` drawn as the filled pill, inside the one
                      anchor. Not a second link and not focusable. */}
                  <span className="board-book__cta">{boardCopy.books.buy}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {ctaLabel ? (
          <div className="board-band__foot">
            <Link className="site-btn site-btn--solid" href="/books">
              {ctaLabel}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
