import Link from 'next/link';
import { copy } from '@ayman/contracts';
import type { BookOrder } from '@ayman/contracts/book-orders';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { StreamBadge } from '@/components/stream-badge';
import { describeBookOrderStatus, formatBookOrderDate, MY_BOOK_ORDERS_HREF } from '@/lib/book-order-view';
import { newestFirst } from '@/lib/my-book-orders';
import { formatEGP, formatShipping } from '@/lib/price';

const c = copy.books.mine;
const b = copy.books;

/**
 * «كتبي» — what the student ALREADY bought, on their own home screen.
 *
 * ## The silence this ends
 *
 * Ordering a printed book was the one flow on this platform that finished with
 * nothing. The checkout said «هيوصلك» and after that the product had no opinion
 * at all: no page, no card, no notification. `GET /api/book-orders/mine` has
 * existed and been permissioned since the shop shipped and was rendered
 * NOWHERE, so the only way a student could find out where their book was, was
 * to phone and ask — «وصل ولا لسه؟» and «هو أصلاً وصلكم؟», which is what every
 * string in `copy.books.mine` was written to answer before it is asked.
 *
 * ## Why it sits ABOVE `<BooksSection>`
 *
 * The two are one paragraph on the page: what you have, then what else there
 * is. A student with a book in transit scrolling past a shop to find out where
 * it got to reads as a product that would rather sell them a second one than
 * tell them about the first. What you already bought outranks what you might
 * buy — and the «اطلب كتاب تاني» action at the foot of this section is the
 * bridge between them, so the shop below is a continuation rather than an
 * interruption.
 *
 * ## Why it takes its orders as a prop
 *
 * Same reason `<BooksSection>` does, and one more. The dashboard already awaits
 * nine things in one `Promise.all`; fetching here would add an await on the
 * critical path of the heaviest page in the app. The additional reason is that
 * `getMyBookOrdersOrEmpty` swallows its own failure — the caller passes `[]`
 * whether the student has no orders or the API is unreachable, and this
 * component renders NOTHING for `[]` either way. A student on a bad minute sees
 * the dashboard they saw yesterday, never a card apologising for itself.
 *
 * ## Two, not all of them
 *
 * The card answers «فين كتابي», which is a question about the order still
 * moving — and the second slot is there because «واحد وصل والتاني لسه» is a
 * real and common pair. Everything older belongs on `/books/mine`, which is
 * what «كل طلباتي» is for; a dashboard section that grows without bound is a
 * receipt archive nobody asked to have on their home screen.
 */
export function MyBookOrdersSection({
  orders,
  supportHref,
}: {
  orders: readonly BookOrder[];
  /**
   * `waMeHref(settings.contact.whatsapp)` — `null` when no support number is
   * configured, and the link is then simply absent. A «كلّم الدعم» button that
   * opens WhatsApp's own marketing page is a bug this repo has shipped once
   * already; see `waMeHref`'s own note.
   */
  supportHref: string | null;
}) {
  /*
   * Nothing at all, not an empty state. This section is an addition to a screen
   * that was complete without it: a student who has never ordered a book must
   * see the page exactly as it was, and the shop directly underneath is already
   * the invitation an empty state here would be duplicating.
   */
  if (orders.length === 0) return null;

  const recent = newestFirst(orders).slice(0, 2);

  return (
    <section>
      <div className="group-head">
        <span className="group-head__mark" aria-hidden="true" />
        <h2 className="group-head__title">{c.title}</h2>
        <Link href={MY_BOOK_ORDERS_HREF} className="group-head__count hover:text-accent-text">
          {c.all}
        </Link>
      </div>

      <ul className="space-y-4">
        {recent.map((order) => (
          <BookOrderCard key={order.id} order={order} supportHref={supportHref} />
        ))}
      </ul>

      {/*
        «يقدر يطلب كتاب تاني» — worded as an ADDITION and never as a retry.

        `chip--accent` and not `chip--solid`: the dashboard's one filled amber
        surface is the resume card at the top of this column, and a second
        filled button down here would compete with it for the same "this is the
        thing to press" reading. Outlined amber is the weight for a real action
        that is not THE action — the same slot «راجع إجاباتك» occupies on
        «امتحاناتك» two sections up.
      */}
      <div className="mt-4">
        <Link href="/books" className="chip chip--accent">
          {c.orderAnother}
        </Link>
      </div>
    </section>
  );
}

/**
 * ONE order, everywhere it is shown.
 *
 * Exported and reused verbatim by `/books/mine` rather than being written twice
 * at two densities. The card is the answer to a question a student asks in both
 * places, and two renderings of it are two chances for the dashboard to say
 * «في الطريق» while the history page says «وصلك» about the same row.
 *
 * Modelled on `library-course-card.tsx`: the app shell's product tokens
 * (`panel`, `--fs-*`, `--fw-*`, `text-fg`, `bg-surface-*`), never the `.site-*`
 * marketing classes `/books` itself is built from — those live under
 * `(site)/styles/*.css`, which the app shell does not import, so they would
 * resolve to nothing here.
 */
export function BookOrderCard({
  order,
  supportHref,
}: {
  order: BookOrder;
  supportHref: string | null;
}) {
  const status = describeBookOrderStatus(order.status);

  return (
    <li className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/*
          The chip is painted from ONE token reference so the wash, the hairline
          and the ink can never drift apart across five states — `--tone` is set
          inline and everything else reads it. `color-mix` against `--n-1` keeps
          the wash on the page's own ground in both themes rather than baking a
          light-mode tint that goes muddy in dark.
        */}
        <span
          className="inline-flex items-center rounded-[var(--r-sm)] px-2.5 py-1 text-[length:var(--fs-text-sm)] font-[var(--fw-medium)]"
          style={{
            ['--tone' as string]: status.tone,
            color: 'var(--tone)',
            background: 'color-mix(in oklch, var(--tone) 12%, var(--n-1))',
            boxShadow: 'inset 0 0 0 var(--hairline) color-mix(in oklch, var(--tone) 35%, transparent)',
          }}
        >
          {status.label}
        </span>

        <time
          dateTime={order.createdAt}
          className="mono text-[length:var(--fs-mono-label)] text-fg-faint"
        >
          {formatCopy(c.placedOn, { date: formatBookOrderDate(order.createdAt) })}
        </time>
      </div>

      {/*
        The books themselves — the thing the student is waiting for, and the
        reason `c.title` is «كتبي» and not «طلباتي».

        `<StreamBadge>` only when the line still HAS a stream: `forGeneral` and
        `forLanguages` are nullable together on `BookOrderLineSchema` — a line an
        admin typed by hand, or one whose book row was deleted — and rendering
        «عام» for a null is inventing a fact about a printed object. The badge is
        read off the live book rather than frozen with the price, deliberately;
        see the field's own note.
      */}
      <ul className="mt-3 space-y-1.5">
        {order.items.map((line, index) => (
          <li
            key={line.bookId ?? `${index}-${line.titleAr}`}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
          >
            <span className="text-[length:var(--fs-text-base)] font-[var(--fw-medium)] text-fg">
              {line.titleAr}
            </span>
            {line.quantity > 1 ? (
              <span className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
                {formatCopy(c.lineQuantity, { quantity: line.quantity })}
              </span>
            ) : null}
            {line.forGeneral !== null && line.forLanguages !== null ? (
              <StreamBadge forGeneral={line.forGeneral} forLanguages={line.forLanguages} />
            ) : null}
            <span className="ms-auto text-[length:var(--fs-text-sm)] text-fg-muted">
              {formatEGP(line.unitPriceCents * line.quantity)}
            </span>
          </li>
        ))}
      </ul>

      {/*
        Four numbers rather than one, on every surface that shows money — «٥٦٥
        جنيه» with nothing explaining the ٦٥ is the commonest reason somebody
        calls to ask whether they were overcharged. The identity
        `total = items + shipping − discount` is a CHECK constraint, so these
        cannot disagree with the row they came from.

        `formatShipping` and not `formatEGP` on the shipping row: a zero fee is a
        real, chosen configuration, and `0` beside a currency word reads as a
        number that failed to load.
      */}
      <dl className="mt-3 space-y-1 border-t border-line-subtle pt-3 text-[length:var(--fs-text-sm)]">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-fg-muted">{b.subtotal}</dt>
          <dd className="text-fg">{formatEGP(order.itemsCents)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-fg-muted">{b.shipping}</dt>
          <dd className="text-fg">{formatShipping(order.shippingCents, b.shippingFree)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="font-[var(--fw-medium)] text-fg">{b.total}</dt>
          <dd className="text-[length:var(--fs-title-4)] font-[var(--fw-bold)] text-accent-text">
            {formatEGP(order.amountCents)}
          </dd>
        </div>
      </dl>

      {/*
        THE line this whole section exists for. «أوقات الكتاب بيتأخر، طمّنه» —
        the chip says the state in one word, and this says what it means and
        what happens next.
      */}
      <p className="mt-3 text-[length:var(--fs-text-sm)] text-fg-muted">{status.note}</p>

      {/*
        The admin's own words, VERBATIM, under a prefix that marks them as a
        quote and not as ours — the same rule `payment_rejected` follows in the
        notification feed. `rejectionReason` is non-null exactly when
        `rejectedAt` is (the database CHECK makes the pair inseparable), so this
        never renders an empty «السبب:».
      */}
      {order.rejectionReason ? (
        <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg">
          <span className="text-fg-muted">{c.rejectionReason}</span>{' '}
          <span className="font-[var(--fw-medium)]">{order.rejectionReason}</span>
        </p>
      ) : null}

      {/*
        The dates the student came to read. `shippedAt` is what the platform did,
        `deliveredAt` is what actually happened — they are two facts and the card
        shows both when it has both, because an order marked delivered three days
        after it shipped is the reassurance, not the redundancy.
      */}
      {order.shippedAt || order.deliveredAt ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {order.shippedAt ? (
            <time
              dateTime={order.shippedAt}
              className="mono text-[length:var(--fs-mono-label)] text-fg-faint"
            >
              {formatCopy(c.shippedOn, { date: formatBookOrderDate(order.shippedAt) })}
            </time>
          ) : null}
          {order.deliveredAt ? (
            <time
              dateTime={order.deliveredAt}
              className="mono text-[length:var(--fs-mono-label)] text-fg-faint"
            >
              {formatCopy(c.deliveredOn, { date: formatBookOrderDate(order.deliveredAt) })}
            </time>
          ) : null}
        </div>
      ) : null}

      {/*
        «كلّم الدعم» — on a CLOSED order only, and only when a number is
        configured. An order still moving has nothing a support chat could add
        that the note above does not already say, and offering one there invites
        a call the section exists to prevent.

        A plain `<a>`: this leaves the product entirely, so it is not a `<Link>`
        and it does not prefetch.
      */}
      {status.closed && supportHref ? (
        <a
          href={supportHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'mt-3 inline-flex min-h-11 items-center md:min-h-0',
            'text-[length:var(--fs-text-sm)] text-accent-text hover:underline',
          )}
        >
          {c.support}
        </a>
      ) : null}
    </li>
  );
}
