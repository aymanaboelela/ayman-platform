import Link from 'next/link';
import type { BookCard } from '@ayman/contracts/books';
import { getBookCatalogOrEmpty } from '@/lib/books';
import { formatEGP } from '@/lib/price';
import { NeonCommand, NeonHead, NeonMeta, NeonWindow, type MetaRow } from './neon-chrome';
import { META, MARKERS, neonCopy } from './neon-copy';

export interface NeonBooksProps {
  title: string;
  lead: string;
  ctaLabel: string;
  limit: number;
  level: 1 | 2;
}

/**
 * The `books` block — `// books`.
 *
 * Same read as the classic strip (`getBookCatalogOrEmpty`, one `'use cache'`
 * on one tag shared with `/books`), same flattening of the shelves, and the
 * same ⚠️ ORDER: `showOnLanding` filters BEFORE `.slice(limit)`. Filtering the
 * sliced array instead takes the first three books in catalogue order and then
 * throws away whichever of them are unadvertised — so a shop with twenty books
 * and two unflagged ones at the top renders a one-card strip that looks
 * half-loaded, with nothing in the payload to say why. `<BooksStrip>` carries
 * the same warning for the same reason.
 *
 * ## An empty shop renders NOTHING, and that is not the same decision the
 * ## course grid made
 *
 * The course section draws a designed empty state because a new instructor
 * WILL publish courses and a landing page with no course section is a landing
 * page with nothing on it. A shop is different: most instructors never sell a
 * printed book at all, and «لسه مفيش كتب» on a site that is never going to
 * have any is an apology for a product that was never promised. A section that
 * stands down is correct here; on the course grid it was not.
 */
export async function NeonBooks({ title, lead, ctaLabel, limit, level }: NeonBooksProps) {
  const catalog = await getBookCatalogOrEmpty();

  const books: BookCard[] = catalog.shelves
    .flatMap((shelf) => [...shelf.first, ...shelf.second, ...shelf.full])
    .filter((book) => book.showOnLanding)
    .slice(0, limit);

  if (books.length === 0) return null;

  return (
    <section className="neon-section" id="books-strip">
      <div className="neon-shell">
        <NeonHead marker={MARKERS.books} title={title} lead={lead} level={level} />

        <ul className="neon-grid">
          {books.map((book) => {
            const rows: MetaRow[] = [
              ...(book.pageCount === null
                ? []
                : [{ key: META.pages, value: String(book.pageCount) }]),
              { key: META.price, value: formatEGP(book.priceCents) },
            ];

            /* `/books#book-<slug>` — the shop, scrolled to THIS title's card,
               where the stepper and the checkout live. The strip has no basket
               of its own on either preset: `<BooksShop>` is a client component
               with a cart in it and none of that belongs on the LCP path of a
               marketing page. */
            const href = `/books#book-${book.slug}`;

            return (
              <li className="neon-book" key={book.id}>
                <NeonWindow file={book.slug}>
                  <h3 className="neon-course__title">
                    <Link href={href}>{book.titleAr}</Link>
                  </h3>
                  {book.subtitleAr ? <p className="neon-course__sub">{book.subtitleAr}</p> : null}

                  <NeonMeta rows={rows} />

                  <div className="neon-course__cmd">
                    {book.inStock ? (
                      <NeonCommand href={href} variant="path" tabIndex={-1}>
                        {neonCopy.booksBuy}
                      </NeonCommand>
                    ) : (
                      /* Not a disabled link — a disabled link is still a link
                         to a keyboard and still announces itself as one. A
                         plain span states the fact and takes no interaction it
                         cannot honour. */
                      <span className="neon-flag">{neonCopy.booksOut}</span>
                    )}
                  </div>
                </NeonWindow>
              </li>
            );
          })}
        </ul>

        {ctaLabel ? (
          <div className="neon-section__foot">
            <NeonCommand href="/books" variant="path">
              {ctaLabel}
            </NeonCommand>
          </div>
        ) : null}
      </div>
    </section>
  );
}
