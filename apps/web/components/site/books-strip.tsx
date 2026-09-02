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
      <div className="site-shell">
        <div className="site-eyebrow-row">
          <div>
            <h2 className="site-h2">{title}</h2>
            {lead ? (
              <p className="site-lead" style={{ maxWidth: '38rem' }}>
                {lead}
              </p>
            ) : null}
          </div>
          {ctaLabel ? (
            <Link className="site-btn site-btn--solid" href="/books">
              {ctaLabel}
            </Link>
          ) : null}
        </div>

        <ul className="books-grid">
          {books.map((book) => (
            <li key={book.id}>
              {/*
                The whole card is one link to the shop, not a link on the title
                with dead space around it — there is nothing else to press here
                (the stepper lives on `/books`), so anything less than the whole
                card is a target a thumb misses.
              */}
              <Link href="/books" className="book-card book-card--link">
                <div className="book-card__art">
                  <CourseArt
                    coverKey={book.coverKey}
                    subjectNameAr={book.titleAr}
                    seed={book.slug}
                    compact
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
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
