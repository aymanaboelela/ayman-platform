'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Check, Layers, Minus, Plus, ShoppingBag, Truck } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import {
  MAX_BOOK_QUANTITY,
  bookOrderTotals,
  minBookShippingCents,
  type BookCard,
  type BookCatalog,
  type BookShelf,
  type BookShippingRates,
  type BookTerm,
} from '@ayman/contracts/books';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { CourseArt } from '@/components/course-art';
import { StreamBadge } from '@/components/stream-badge';
import { BookOrderPanel } from '@/components/site/book-order-panel';
import { subjectArt } from '@/lib/subject-art';
import { formatEGP } from '@/lib/price';

const c = copy.books;

/**
 * A price as the shop prints it: the figure, then a smaller «ج».
 *
 * `<bdi>` around the figure because it is a Latin-digit run inside Arabic and
 * `formatEGP` groups thousands with «٬» — isolated, it can never be reordered
 * against the unit or the words around it. The unit is its own span so the
 * card can set it a step smaller than the number, which is what makes «250 ج»
 * read as a price rather than as a sentence.
 */
function Money({ cents }: { cents: number }) {
  return (
    <>
      <bdi className="books-money">{formatEGP(cents)}</bdi>{' '}
      <span className="books-money__unit">{c.currencyShort}</span>
    </>
  );
}

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
  instapay,
  vodafoneCash,
}: {
  catalog: BookCatalog;
  /** E.164, or `null` when the admin has not configured one yet. */
  instapay: string | null;
  /** The wallet number, threaded beside `instapay` — see `ContactSchema`. */
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

  /** The cheapest zone — what the basket may quote as a FLOOR before it knows
   *  an address. Never what it charges. */
  const fromShippingCents = minBookShippingCents(catalog.shippingRates);

  /*
   * ⚠️ Shipping is `0` HERE, and the basket's own «الشحن» row says «على حسب
   * المحافظة» rather than a number.
   *
   * The fee depends on where the parcel is going and nothing on this page knows
   * that yet — the governorate is chosen inside `BookOrderPanel`, which quotes
   * the real number the instant it is. Adding the cheapest zone here instead
   * would show «٨٠ ج» to a reader in أسوان and then replace it with «١٥٠ ج» one
   * screen later, which is a price that went up on them.
   */
  const totals = bookOrderTotals(
    lines.map((line) => ({ unitPriceCents: line.book.priceCents, quantity: line.quantity })),
    0,
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
          <span className="books-empty__icon" aria-hidden="true">
            <BookOpen size={30} />
          </span>
          <p className="books-empty__title">{c.empty}</p>
          <p className="books-empty__note">{c.emptyNote}</p>
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
          <span className="books-bar__bag" aria-hidden="true">
            <ShoppingBag size={18} />
            <span className="books-bar__count">{bookCount}</span>
          </span>
          <div className="books-bar__totals">
            <span className="books-bar__total">
              <Money cents={totals.totalCents} />
            </span>
            {/* The count and the one thing the figure above leaves out. It
                used to repeat the total word for word — «الطلب فيه ٢ كتاب —
                الإجمالي ٥٠٠» under «٥٠٠» — and still never said that the
                courier is on top. */}
            <span className="books-bar__detail">
              {formatCopy(c.shelfCount, { n: bookCount })} · {c.shipping} {c.shippingByGovernorate}
            </span>
          </div>
          <button type="button" className="books-bar__cta" onClick={() => setCheckingOut(true)}>
            {c.checkout}
            <ArrowLeft size={16} aria-hidden="true" />
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
            <div className="books-cart__head">
              <span className="books-cart__icon" aria-hidden="true">
                <ShoppingBag size={18} />
              </span>
              <p className="books-cart__title">{c.cartTitle}</p>
              {bookCount > 0 ? (
                <span className="books-cart__count">{formatCopy(c.shelfCount, { n: bookCount })}</span>
              ) : null}
            </div>

            {lines.length === 0 ? (
              <div className="books-cart__empty">
                <p className="books-cart__empty-title">{c.cartEmpty}</p>
                <p className="books-cart__empty-hint">{c.cartEmptyHint}</p>
              </div>
            ) : (
              <>
                <ul className="books-cart__lines">
                  {lines.map((line) => (
                    <li key={line.book.id} className="books-cart__line">
                      <span className="books-cart__line-title">{line.book.titleAr}</span>
                      <span className="books-cart__line-total">
                        <Money cents={line.book.priceCents * line.quantity} />
                      </span>
                      <span className="books-cart__line-sub">
                        <span>
                          {formatCopy(c.lineQuantity, {
                            quantity: line.quantity,
                            price: formatEGP(line.book.priceCents),
                          })}
                        </span>
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

                <Totals totals={totals} fromShippingCents={fromShippingCents} />

                <button
                  type="button"
                  className="books-cart__cta"
                  onClick={() => setCheckingOut(true)}
                >
                  {c.checkout}
                  <ArrowLeft size={17} aria-hidden="true" />
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
          : formatCopy(c.cartAnnounce, { n: bookCount, price: formatEGP(totals.itemsCents) })}
      </p>

      <Dialog open={checkingOut} onOpenChange={setCheckingOut}>
        {/*
          `bco-dialog` hands the dialog's layout to the checkout: a sheet on a
          phone, a wide two-column dialog on a desktop, with the panel's own
          footer pinned outside the scrolling body. See `book-checkout.css`.
        */}
        <DialogContent closeLabel={copy.common.close} className="bco-dialog">
          <DialogHeader className="bco-dialog__head">
            <DialogTitle>{c.cartTitle}</DialogTitle>
          </DialogHeader>
          {/*
            The SAME panel the course page uses — address, then payment, with
            the guest-resume behaviour intact. It is handed a cart instead of a
            course id; everything after that is identical, which is the whole
            reason it was generalised rather than copied.

            ⚠️ The basket's lines go IN as `summaryLines` rather than being
            drawn up here. They used to be a second summary box above the
            panel's own — the same order listed twice, one box inside another.
            The panel's summary is the one that moves with the governorate, so
            it is the one that stays.
          */}
          <BookOrderPanel
            items={lines.map((line) => ({ bookId: line.book.id, quantity: line.quantity }))}
            summaryLines={lines.map((line) => ({
              title: line.book.titleAr,
              quantity: line.quantity,
              unitCents: line.book.priceCents,
            }))}
            itemsCents={totals.itemsCents}
            shippingRates={catalog.shippingRates}
            instapay={instapay}
            vodafoneCash={vodafoneCash}
            onCancel={() => setCheckingOut(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The basket's three rows, BEFORE an address exists.
 *
 * «الشحن» names the rule instead of a number, and «الإجمالي» is a floor rather
 * than a price — see `copy.books.shippingByGovernorate`. Both become real
 * figures inside `BookOrderPanel` the moment a governorate is picked, and the
 * rows keep their labels and their order so the reader watches two values
 * change rather than a layout.
 */
function Totals({
  totals,
  fromShippingCents,
}: {
  totals: ReturnType<typeof bookOrderTotals>;
  fromShippingCents: number;
}) {
  return (
    <div className="books-cart__totals">
      <div className="books-cart__row">
        <span>{c.subtotal}</span>
        <span>{formatEGP(totals.itemsCents)}</span>
      </div>
      <div className="books-cart__row">
        <span>{c.shipping}</span>
        <span>{c.shippingByGovernorate}</span>
      </div>
      <div className="books-cart__row books-cart__row--total">
        <span>{c.total}</span>
        <span>
          {formatCopy(c.totalFrom, {
            price: formatEGP(totals.itemsCents + fromShippingCents),
          })}
        </span>
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
            <div key={key} className="books-term">
              <h3 className="books-term__label">
                {label}
                <span className="books-term__count">{inTerm.length}</span>
              </h3>
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
    <article
      className={`book-card${quantity > 0 ? ' book-card--in-cart' : ''}${book.inStock ? '' : ' book-card--sold-out'}`}
      id={`book-${book.slug}`}
    >
      {/*
        The art is a STAGE with the jacket standing on it, not a full-bleed
        crop: a tinted panel in the subject's hue, and the book on it at its
        own 3/4 with a spine and a shadow. It reads as a printed object you
        can order, which a flat 3/4 rectangle edge to edge never did.

        `.book-card__jacket` is the positioned box the cover fills — an
        uploaded cover is `next/image` with `fill`, and without its own box it
        would fill the whole stage, padding and all.
      */}
      <div className="book-card__art">
        <div className="book-card__jacket">
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
              default is `128px`, written for two thumbnails. A 128px file
              stretched over a card is what «الكواليتي وحشة جدا» was, and 20rem
              still covers the widest jacket at 2x.
            */
            sizes="20rem"
          />
        </div>

        {/* One tag at most, in the order that matters to the reader: already
            in the basket, then can't be bought, then on offer. */}
        {quantity > 0 ? (
          <span className="book-card__tag book-card__tag--in-cart">
            <Check size={13} aria-hidden="true" />
            {c.added}
          </span>
        ) : !book.inStock ? (
          <span className="book-card__tag book-card__tag--sold-out">{c.outOfStock}</span>
        ) : book.comparePriceCents !== null && book.comparePriceCents > book.priceCents ? (
          <span className="book-card__tag book-card__tag--sale">{c.discount}</span>
        ) : null}
      </div>

      <div className="book-card__body">
        <h4 className="book-card__title">{book.titleAr}</h4>
        {book.subtitleAr ? <p className="book-card__subtitle">{book.subtitleAr}</p> : null}

        <div className="book-card__meta">
          {/*
            عام / لغات, FIRST in the row and before the year.

            The شرح book and the لغات edition of the same subject are two rows
            in this shelf with almost the same title, the same cover art and
            often the same price — «كتاب تانية بكالوريا برمجة» twice. Without
            this chip the only thing telling them apart is a word buried in the
            title, and the failure mode is a student paying ٦٥ جنيه of shipping
            for the wrong edition, which is exactly the mistake the course cards
            carry the same chip to prevent (`CourseCard`, under the title).

            `<StreamBadge>` and never a hand-rolled pill: the words «عام» and
            «لغات», their two colours and their order are decided in ONE place
            for the admin form, the course card and this card together — see
            its docblock. It renders nothing when both flags are false, which is
            a state the database makes unreachable and a stale cached payload
            can still produce.

            Before the year and the page count because the stream decides
            whether this book is for you AT ALL; how many pages it runs to is
            only worth reading once it is.
          */}
          <StreamBadge forGeneral={book.forGeneral} forLanguages={book.forLanguages} />
          {book.year !== null ? (
            <span className="book-chip">{formatCopy(c.yearChip, { n: book.year })}</span>
          ) : null}
          {book.pageCount !== null ? (
            <span className="book-chip">{formatCopy(c.pages, { n: book.pageCount })}</span>
          ) : null}
        </div>

        <div className="book-card__price-row">
          <span className="book-card__price">
            <Money cents={book.priceCents} />
          </span>
          {book.comparePriceCents !== null ? (
            <span className="book-card__was">
              <bdi>{formatEGP(book.comparePriceCents)}</bdi>
            </span>
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

/**
 * The hero's shipping card — exported so the page can render it server-side.
 *
 * It states the RULE, then the FLOOR, then each zone on its own row. «الشحن ٨٠
 * ج» alone would be a number two thirds of the country is not charged, and this
 * card is read on the shelf precisely so nobody meets the real figure as a
 * surprise at the address form.
 *
 * ⚠️ It was one `<p>` pill holding two sentences — `shippingOnce` and then
 * `shippingZones` in a `<small>` with nothing between them — and it rendered
 * as «…مهما كان عدد الكتبالقاهرة والجيزة 80 · …» in 11px type. Every piece now
 * has its own element, so there is no inline seam left for two strings to meet
 * at.
 *
 * Every figure is the live setting (`catalog.shippingRates`), never a literal.
 */
export function BooksShippingChip({ rates }: { rates: BookShippingRates }) {
  const free = rates.cairo_giza === 0 && rates.delta === 0 && rates.far === 0;
  const floor = minBookShippingCents(rates);
  const zones = [
    { key: 'near', label: c.shippingZoneNear, cents: rates.cairo_giza },
    { key: 'delta', label: c.shippingZoneDelta, cents: rates.delta },
    { key: 'far', label: c.shippingZoneFar, cents: rates.far },
  ] as const;

  return (
    <div className={`books-ship${free ? ' books-ship--free' : ''}`}>
      <div className="books-ship__head">
        <span className="books-ship__icon" aria-hidden="true">
          <Truck size={20} />
        </span>
        <div className="books-ship__text">
          {/* A whole different sentence when delivery is free everywhere, not
              the same one with «٠ ج» in its slot — see `shippingFreeOnce`. The
              zoned wording spends its second half promising the fee is charged
              once, which is nonsense about a fee that is not charged at all. */}
          <p className="books-ship__title">{free ? c.shippingFreeOnce : c.shippingHeadline}</p>
          {!free && floor > 0 ? (
            <p className="books-ship__note">
              {formatCopy(c.shippingFromNote, { price: formatEGP(floor) })}
            </p>
          ) : null}
        </div>
      </div>

      {free ? null : (
        <ul className="books-ship__zones">
          {zones.map((zone) => (
            <li key={zone.key} className={`books-ship__zone books-ship__zone--${zone.key}`}>
              <span className="books-ship__zone-name">{zone.label}</span>
              <span className="books-ship__zone-price">
                {/* A zone that is free while the others are not says so in a
                    word — `formatEGP(0)` alone is a bare «0». Same rule as
                    `formatShipping`. */}
                {zone.cents === 0 ? c.shippingFree : <Money cents={zone.cents} />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
