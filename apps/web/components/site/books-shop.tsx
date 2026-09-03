'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Layers, Minus, Plus, ShoppingBag, Truck } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import {
  MAX_BOOK_QUANTITY,
  bookOrderTotals,
  type BookCard,
  type BookCatalog,
  type BookShelf,
  type BookTerm,
} from '@ayman/contracts/books';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { CourseArt } from '@/components/course-art';
import { BookOrderPanel } from '@/components/site/book-order-panel';
import { subjectArt } from '@/lib/subject-art';
import { formatEGP, formatShipping } from '@/lib/price';

const c = copy.books;

/** The three bands inside a shelf, in render order, with their headings. */
const TERMS: readonly { key: BookTerm; label: string }[] = [
  { key: 'first', label: c.termFirst },
  { key: 'second', label: c.termSecond },
  { key: 'full', label: c.termFull },
];

/**
 * «قسم الكتب» — the shop.
 *
 * ## Why the basket lives here and not in `localStorage`
 *
 * It is one page. Everything a reader needs — browse, count, total, order — is
 * on this screen, and the checkout dialog opens over it rather than navigating
 * away, so there is no moment where a page load could lose the basket. Persisting
 * it would buy back only the case of someone closing the tab mid-shop, at the
 * cost of a stored basket that goes stale against a catalogue that has since
 * been repriced — and a basket that quietly shows yesterday's price is worse
 * than one that is empty. The half that IS worth persisting — an order already
 * submitted but not yet paid for — already is, by `book-order-storage.ts`.
 *
 * ## The totals are computed by the contract, not here
 *
 * `bookOrderTotals` is the same function the API uses to write the order. That
 * is deliberate: the number on this screen and the number in the database are
 * produced by one piece of code, so they cannot drift — and the shipping rule
 * («مرة واحدة على الطلب كله») is stated once rather than twice.
 */
export function BooksShop({
  catalog,
  vodafoneCash,
}: {
  catalog: BookCatalog;
  /** E.164, or `null` when the admin has not configured one yet. */
  vodafoneCash: string | null;
}) {
  /*
    Land on the right book when the URL carries one.

    The landing strip and the dashboard both link `/books#book-{slug}`, and on a
    COLD load that hash does nothing on its own: this page's shelves are not in
    the initial HTML — they arrive on the RSC stream — so the browser processes
    the fragment while `#book-{slug}` does not exist yet and gives up. Verified
    against production: `curl /books` returns one `book-card` string in a flight
    payload and zero rendered cards.

    This effect runs after THIS component has painted the shelves, which is by
    definition after the target exists. `'auto'` rather than `'smooth'`: the
    reader arrived by pressing «اشتري الآن» on another page and is expecting to
    be there, not to watch a journey — and a smooth scroll from the top of a
    long shop is a second of nothing happening.

    `[]` — mount only. A hash change while the page is already open is the
    browser's own job and it can do it, because the anchors are in the DOM by
    then.
  */
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id.startsWith('book-')) return;
    // `getElementById` and not `querySelector('#' + id)`: a slug is
    // author-controlled and can carry characters that are not a valid CSS
    // identifier, which would throw rather than miss.
    document.getElementById(id)?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, []);

  /** `bookId → quantity`. Absent means "not in the basket"; a quantity is never 0. */
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [checkingOut, setCheckingOut] = useState(false);

  /** Every card on the page, so a basket line can name its book. */
  const booksById = useMemo(() => {
    const map = new Map<string, BookCard>();
    for (const shelf of catalog.shelves) {
      for (const book of [...shelf.first, ...shelf.second, ...shelf.full]) {
        map.set(book.id, book);
      }
    }
    return map;
  }, [catalog]);

  const lines = useMemo(
    () =>
      Object.entries(quantities)
        .map(([bookId, quantity]) => {
          const book = booksById.get(bookId);
          return book ? { book, quantity } : null;
        })
        .filter((line): line is { book: BookCard; quantity: number } => line !== null),
    [quantities, booksById],
  );

  const totals = bookOrderTotals(
    lines.map((line) => ({ unitPriceCents: line.book.priceCents, quantity: line.quantity })),
    catalog.shippingCents,
  );

  const bookCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  function setQuantity(bookId: string, next: number) {
    setQuantities((current) => {
      /* A quantity of 0 REMOVES the key rather than storing a zero. The cart
         payload is derived straight from this object, and a `{ id: 0 }` line
         would be a line the contract rejects for a book nobody asked for. */
      if (next <= 0) {
        const { [bookId]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [bookId]: Math.min(next, MAX_BOOK_QUANTITY) };
    });
  }

  if (catalog.shelves.length === 0) {
    return (
      <div className="site-shell books-shelves">
        <div className="books-empty">
          <BookOpen size={28} aria-hidden="true" />
          <p className="books-empty__title">{c.empty}</p>
          <p>{c.emptyNote}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/*
        The phone basket — ABOVE the shelves, not across the bottom of them.

        It was a bar fixed to the bottom edge, which is the conventional place
        for one and was the wrong place here for two reasons that only show up
        on a real phone: the assistant's floating button sits in that same
        corner and covered «كمّل الطلب», and a total pinned to the bottom of a
        page whose content scrolls under it reads as part of the browser chrome
        rather than as the basket. Reported as «هي تحت ومستخبية».

        So: sticky, under the site header, in normal flow. It clears the pinned
        nav card (`--site-nav-h` plus the 0.75rem margin that card carries), it
        is the first thing under the hero, and it stays in view for the whole
        page because `.books-page` is its containing block.

        Rendered only when there is something in it — an empty bar pinned over
        every scroll would be a permanent strip of nothing on the smallest
        screen this page is read on. The cost is a one-time downward shift of
        the shelves when the first book is added, which is the direction that
        keeps the card under the reader's finger on screen.
      */}
      {lines.length > 0 ? (
        <div className="books-bar">
          <div className="books-bar__totals">
            <span className="books-bar__total">{formatEGP(totals.totalCents)}</span>
            <span className="books-bar__detail">
              {formatCopy(c.cartAnnounce, {
                n: bookCount,
                price: formatEGP(totals.totalCents),
              })}
            </span>
          </div>
          <button type="button" className="books-bar__cta" onClick={() => setCheckingOut(true)}>
            {c.checkout}
          </button>
        </div>
      ) : null}

      <div className="site-shell books-shelves">
        <div className="books-layout">
          <div className="books-shelves">
            {catalog.shelves.map((shelf) => (
              <Shelf
                key={shelf.subjectId ?? 'general'}
                shelf={shelf}
                quantities={quantities}
                onSetQuantity={setQuantity}
              />
            ))}
          </div>

          <aside className="books-cart" aria-label={c.cartTitle}>
            <p className="books-cart__title">
              <ShoppingBag size={18} aria-hidden="true" />
              {c.cartTitle}
            </p>

            {lines.length === 0 ? (
              <p className="books-cart__empty">{c.cartEmpty}</p>
            ) : (
              <>
                <ul className="books-cart__lines">
                  {lines.map((line) => (
                    <li key={line.book.id} className="books-cart__line">
                      <span>{line.book.titleAr}</span>
                      <span>{formatEGP(line.book.priceCents * line.quantity)}</span>
                      <span className="books-cart__line-sub">
                        {formatCopy(c.lineQuantity, {
                          quantity: line.quantity,
                          price: formatEGP(line.book.priceCents),
                        })}
                        <button
                          type="button"
                          className="books-cart__remove"
                          onClick={() => setQuantity(line.book.id, 0)}
                        >
                          {c.remove}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>

                <Totals totals={totals} />

                <button
                  type="button"
                  className="books-cart__cta"
                  onClick={() => setCheckingOut(true)}
                >
                  {c.checkout}
                </button>
                <p className="books-cart__note">{c.checkoutNote}</p>
              </>
            )}
          </aside>
        </div>
      </div>

      {/*
        `role="status"` and off-screen: the bar that just changed is at the top
        of the page and the reader's finger is on a card somewhere below it, so
        the only feedback a screen reader gets from pressing «ضيفه» is this line.
      */}
      <p role="status" aria-live="polite" className="sr-only">
        {lines.length === 0
          ? c.cartEmpty
          : formatCopy(c.cartAnnounce, { n: bookCount, price: formatEGP(totals.totalCents) })}
      </p>

      <Dialog open={checkingOut} onOpenChange={setCheckingOut}>
        <DialogContent closeLabel={copy.common.close}>
          <DialogHeader>
            <DialogTitle>{c.cartTitle}</DialogTitle>
          </DialogHeader>
          <div className="books-checkout">
            <div className="books-checkout__summary">
              {lines.map((line) => (
                <div key={line.book.id} className="books-cart__row">
                  <span>
                    {formatCopy(c.lineTitleQuantity, {
                      title: line.book.titleAr,
                      quantity: line.quantity,
                    })}
                  </span>
                  <span>{formatEGP(line.book.priceCents * line.quantity)}</span>
                </div>
              ))}
              <Totals totals={totals} />
            </div>

            {/*
              The SAME panel the course page uses — address, then the Vodafone
              Cash step, with the guest-resume behaviour intact. It is handed a
              cart instead of a course id; everything after that is identical,
              which is the whole reason it was generalised rather than copied.
            */}
            <BookOrderPanel
              items={lines.map((line) => ({ bookId: line.book.id, quantity: line.quantity }))}
              amountCents={totals.totalCents}
              vodafoneCash={vodafoneCash}
              onCancel={() => setCheckingOut(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Totals({ totals }: { totals: ReturnType<typeof bookOrderTotals> }) {
  return (
    <div className="books-cart__totals">
      <div className="books-cart__row">
        <span>{c.subtotal}</span>
        <span>{formatEGP(totals.itemsCents)}</span>
      </div>
      <div className="books-cart__row">
        <span>{c.shipping}</span>
        <span>{formatShipping(totals.shippingCents, c.shippingFree)}</span>
      </div>
      <div className="books-cart__row books-cart__row--total">
        <span>{c.total}</span>
        <span>{formatEGP(totals.totalCents)}</span>
      </div>
    </div>
  );
}

function Shelf({
  shelf,
  quantities,
  onSetQuantity,
}: {
  shelf: BookShelf;
  quantities: Record<string, number>;
  onSetQuantity: (bookId: string, next: number) => void;
}) {
  const books = [...shelf.first, ...shelf.second, ...shelf.full];
  /*
   * The same hue the dashboard, the library and the catalogue give this
   * subject — `subjectArt` is keyed on the Arabic name, which is the only
   * identifier all of those payloads share. See its own docblock.
   */
  const { hue } = subjectArt(shelf.subjectNameAr);

  return (
    <section
      className="books-shelf"
      style={{ '--book-hue': hue } as React.CSSProperties}
      aria-label={shelf.subjectNameAr}
    >
      <header className="books-shelf__head">
        <span className="books-shelf__mark" aria-hidden="true">
          <Layers size={18} />
        </span>
        <h2 className="books-shelf__title">{shelf.subjectNameAr}</h2>
        <span className="books-shelf__count">{formatCopy(c.shelfCount, { n: books.length })}</span>
      </header>

      <div className="books-shelf__body">
        {TERMS.map(({ key, label }) => {
          const inTerm = shelf[key];
          /* A term with nothing in it renders no band at all — same rule the API
             applies to a subject with no books, one level down. */
          if (inTerm.length === 0) return null;
          return (
            <div key={key}>
              <h3 className="books-term__label">{label}</h3>
              <div className="books-grid">
                {inTerm.map((book) => (
                  <BookTile
                    key={book.id}
                    book={book}
                    subjectNameAr={shelf.subjectNameAr}
                    quantity={quantities[book.id] ?? 0}
                    onSetQuantity={onSetQuantity}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BookTile({
  book,
  subjectNameAr,
  quantity,
  onSetQuantity,
}: {
  book: BookCard;
  subjectNameAr: string;
  quantity: number;
  onSetQuantity: (bookId: string, next: number) => void;
}) {
  return (
    /*
      `id` is the LANDING STRIP'S and the dashboard's anchor target: both link
      «اشتري الآن» at `/books#book-{slug}` so a press lands on this exact
      title's card with its stepper, rather than at the top of a shop the
      reader then has to search. `.book-card` carries a `scroll-margin` for it
      so the card does not arrive tucked under the sticky site header.

      Keyed on the SLUG and not the id: the slug is the stable, human-readable
      handle the two callers already hold, and it is what survives a book being
      re-seeded.
    */
    <article className="book-card" id={`book-${book.slug}`}>
      <div className="book-card__art">
        {/*
          The same generated art the course cards use when nothing is uploaded.
          Ayman is supplying photographs of the real covers; until they land,
          this is a designed jacket in the subject's own hue rather than the grey
          panel that made the signed-in surface read as «مصمطة». An uploaded
          cover wins the moment there is one.
        */}
        <CourseArt
          coverKey={book.coverKey}
          subjectNameAr={subjectNameAr}
          seed={book.slug}
          compact
          /*
            `compact` for the CROP — a 3/4 jacket has to fill this box and the
            title is printed in the card below it — but NOT for its size: that
            default is `128px`, written for two thumbnails, and this card is a
            `.books-grid` track, which caps at 20rem. A 128px file stretched
            over 320px is what «الكواليتي وحشة جدا» was.
          */
          sizes="20rem"
        />
      </div>

      <div className="book-card__body">
        <h4 className="book-card__title">{book.titleAr}</h4>
        {book.subtitleAr ? <p className="book-card__subtitle">{book.subtitleAr}</p> : null}

        <div className="book-card__meta">
          {book.year !== null ? (
            <span className="book-chip">{formatCopy(c.yearChip, { n: book.year })}</span>
          ) : null}
          {book.pageCount !== null ? (
            <span className="book-chip">{formatCopy(c.pages, { n: book.pageCount })}</span>
          ) : null}
        </div>

        <div className="book-card__price-row">
          <span className="book-card__price">{formatEGP(book.priceCents)}</span>
          {book.comparePriceCents !== null ? (
            <span className="book-card__was">{formatEGP(book.comparePriceCents)}</span>
          ) : null}
        </div>

        {!book.inStock ? (
          <button type="button" className="book-card__add" disabled>
            {c.outOfStock}
          </button>
        ) : quantity === 0 ? (
          <button
            type="button"
            className="book-card__add"
            onClick={() => onSetQuantity(book.id, 1)}
          >
            <Plus size={16} aria-hidden="true" />
            {c.add}
          </button>
        ) : (
          /*
            The stepper replaces the button IN PLACE rather than appearing under
            it: «حدد محتاج كام» is the same decision as «ضيفه» one step later, and
            a card that grows a row when pressed reflows the grid under the
            reader's finger.
          */
          <div className="book-stepper">
            <button
              type="button"
              className="book-stepper__btn"
              onClick={() => onSetQuantity(book.id, quantity - 1)}
              aria-label={c.remove}
            >
              <Minus size={16} aria-hidden="true" />
            </button>
            <span className="book-stepper__count" aria-live="off">
              {quantity}
            </span>
            <button
              type="button"
              className="book-stepper__btn"
              onClick={() => onSetQuantity(book.id, quantity + 1)}
              disabled={quantity >= MAX_BOOK_QUANTITY}
              aria-label={c.add}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

/** The hero's shipping chip — exported so the page can render it server-side. */
export function BooksShippingChip({ shippingCents }: { shippingCents: number }) {
  return (
    <p className="books-hero__shipping">
      <Truck size={16} aria-hidden="true" />
      {/* A whole different sentence at zero, not the same one with «٠ ج» in
          its slot — see `shippingFreeOnce`. `shippingOnce` spends its second
          half promising the fee is charged only once, which is nonsense about
          a fee that is not charged, and it buries the best thing this line
          could say. */}
      {shippingCents === 0
        ? c.shippingFreeOnce
        : formatCopy(c.shippingOnce, { price: formatEGP(shippingCents) })}
    </p>
  );
}
