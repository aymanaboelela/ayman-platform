import Link from 'next/link';
import { copy } from '@ayman/contracts';
import type { BookCard } from '@ayman/contracts/books';
import { getBookCatalogOrEmpty } from '@/lib/books';
import { CourseArt } from '@/components/course-art';
import { formatEGP } from '@/lib/price';

const c = copy.landing;

/** How many covers the landing shows before sending people to the shop. */
const STRIP_LIMIT = 3;

export interface BooksStripProps {
  title?: string;
  lead?: string;
  ctaLabel?: string;
  limit?: number;
}

/**
 * «قسم الكتب» on the landing page.
 *
 * The shop shipped with exactly one entrance — knowing that `/books` exists and
 * typing it. This is the section that puts it on the front door, and it is a
 * `home_blocks` block like every other section, so the admin decides whether it
 * runs and where it sits.
 *
 * ## Why it is not `<BooksShop>` with a limit
 *
 * That component is `'use client'` and owns a basket: quantities, a stepper on
 * every card, a checkout dialog. None of that belongs on a marketing page whose
 * job is to say "there are printed books" and hand the reader to the shop —
 * and shipping a cart's worth of client JavaScript onto the LCP path of the
 * landing page to do it would be the expensive way to say it. This is a server
 * component that renders covers and a link.
 *
 * ## Why it flattens the shelves
 *
 * `/books` groups by subject and then by term, which is the right shape for
 * browsing a catalogue and the wrong one for a three-card strip: with one
 * subject on sale, the grouping renders a heading above a heading above three
 * cards. The strip takes the first `limit` books in catalogue order and lets
 * the shop do the sorting.
 *
 * ## Failure
 *
 * `getBookCatalogOrEmpty` never throws — an unreachable API costs this section
 * and not the page, the same trade `<FeaturedCourses>` documents. An empty
 * catalogue renders NOTHING rather than a heading over an empty grid: on a
 * platform whose shop may genuinely have no stock this week, a section that
 * stands down is correct and a section that shows its own emptiness is not.
 */
export async function BooksStrip({
  title = c.booksTitle,
  lead = c.booksLead,
  ctaLabel = c.booksCta,
  limit = STRIP_LIMIT,
}: BooksStripProps = {}) {
  const catalog = await getBookCatalogOrEmpty();

  const books: BookCard[] = catalog.shelves
    .flatMap((shelf) => [...shelf.first, ...shelf.second, ...shelf.full])
    .slice(0, limit);

  if (books.length === 0) return null;

  return (
    <section className="site-section" id="books-strip">
      {/*
        ## The layout, and the one it replaced

        It was a `.site-eyebrow-row` — heading at the inline start, «شوف كل
        الكتب» pushed to the far end — over a `.books-grid`. On a 1152px shell
        with two books on sale that renders as a title, a button stranded ~700px
        away from it with nothing in between, and two covers hugging the right
        edge over an empty half-page. Reported as «الليَاوت وحشة أوووي أوي».

        The grid below is a real two-column split instead: a column that says
        what the book IS (and carries the one link off to the shop), and the
        covers beside it. It stays honest at any stock level — one book, two, or
        six — because the intro column is a fixed track and the covers column is
        what grows. `.books-strip__grid` collapses to one column below `md`.
      */}
      <div className="site-shell books-strip__grid">
        <div className="books-strip__intro">
          <h2 className="site-h2">{title}</h2>
          {lead ? <p className="site-lead">{lead}</p> : null}

          {/* Three facts, and they are the reason the column exists: a heading
              and a button alone do not fill a half-page, and padding it with
              nothing was the bug. */}
          <ul className="books-strip__points">
            <li>{c.booksPoint1}</li>
            <li>{c.booksPoint2}</li>
            <li>{c.booksPoint3}</li>
          </ul>

          {ctaLabel ? (
            <Link className="site-btn site-btn--solid" href="/books">
              {ctaLabel}
            </Link>
          ) : null}
        </div>

        {/* `--cover-count` drives the covers grid's explicit column count —
            see `.books-strip__covers`. It has to be a number the CSS can read
            rather than `auto-fit`, because the parent track is `auto`-sized and
            auto-repeat cannot be resolved against an indefinite width. Clamped
            to 3: past that the row is wider than the band can spare and the
            shop is one link away. */}
        <ul
          className="books-strip__covers"
          style={{ '--cover-count': Math.min(books.length, 3) } as React.CSSProperties}
        >
          {books.map((book) => (
            <li key={book.id}>
              {/*
                ONE anchor around the whole card, with a button-shaped span
                inside it rather than a second `<a>`: a link inside a link is
                invalid HTML and the browser closes the outer one at the inner
                tag, which leaves the cover and the title pointing nowhere.

                It goes to `/books#book-{slug}` — the shop, scrolled to THIS
                title's card, where the stepper and the checkout live. «شراء
                الآن لما يضغط عليها بقى يوديه للكتاب».
              */}
              <Link href={`/books#book-${book.slug}`} className="book-card book-card--link">
                <div className="book-card__art">
                  <CourseArt
                    coverKey={book.coverKey}
                    subjectNameAr={book.titleAr}
                    seed={book.slug}
                    compact
                    /*
                      `compact` for the crop, not for its `128px` default: this
                      track is `minmax(0, 14rem)` on a wide screen and half the
                      row (less the gap) on a phone. Same reason the shop's own
                      card passes one — see `CourseArt`'s `sizes` prop.
                    */
                    sizes="(min-width: 64rem) 14rem, 45vw"
                  />
                </div>
                <div className="book-card__body">
                  <span className="book-card__title">{book.titleAr}</span>
                  {book.subtitleAr ? (
                    <span className="book-card__subtitle">{book.subtitleAr}</span>
                  ) : null}
                  <span className="book-card__price-row">
                    {/* The bare number, exactly as `/books` renders it. The shop
                        prints no currency word beside a price and this strip
                        must not either — two prices for the same book, written
                        two ways, one click apart. */}
                    <span className="book-card__price">{formatEGP(book.priceCents)}</span>
                    {book.comparePriceCents !== null ? (
                      <span className="book-card__was">{formatEGP(book.comparePriceCents)}</span>
                    ) : null}
                  </span>
                  {/* A `<span>` styled as the shop's own `.book-card__add`.
                      The cover used to be a picture with a price under it and
                      nothing that looked pressable at all. */}
                  <span className="book-card__add book-card__add--static">{c.booksBuyNow}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
