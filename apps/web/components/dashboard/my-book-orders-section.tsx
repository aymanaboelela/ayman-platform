import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BookOpen, Check, RotateCcw, X } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { bookOrderDate, type BookOrder } from '@ayman/contracts/book-orders';
import { formatCopy } from '@ayman/contracts/format';
import { mediaUrl } from '@ayman/ui/branding';
import { StreamBadge } from '@/components/stream-badge';
import { BookOrderReceivedButton } from './book-order-received-button';
import { describeBookOrderStatus, formatBookOrderDate, MY_BOOK_ORDERS_HREF } from '@/lib/book-order-view';
import {
  bookOrderStages,
  coverForLine,
  type BookCoverIndex,
  type BookOrderStage,
} from '@/lib/book-order-track';
import { newestFirst } from '@/lib/my-book-orders';
import { formatEGP, formatShipping } from '@/lib/price';
import './my-book-orders.css';

const c = copy.books.mine;
const b = copy.books;

const NO_COVERS: BookCoverIndex = new Map();

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
 * ## Which orders it is handed
 *
 * The CALLER filters, through `bookOrdersForHome` — the home shows only the
 * orders still on their way (and a just-arrived or just-refused one for a few
 * days); see that function for the rule and the numbers. This component
 * renders whatever it is given, so it stays the same object on every stack and
 * the rule lives in one testable place.
 *
 * ## Why it takes its orders as a prop
 *
 * The dashboard already awaits a dozen things in one `Promise.all`; fetching
 * here would add an await on the critical path of the heaviest page in the
 * app. And `getMyBookOrdersOrEmpty` swallows its own failure — the caller
 * passes `[]` whether the student has no orders or the API is unreachable, and
 * this component renders NOTHING for `[]` either way. A student on a bad
 * minute sees the dashboard they saw yesterday, never a card apologising for
 * itself.
 *
 * ## Two, not all of them
 *
 * «واحد وصل والتاني لسه» is a real and common pair, so two slots. Everything
 * else belongs on `/store/orders`, which is what «كل طلباتي» is for.
 */
export function MyBookOrdersSection({
  orders,
  supportHref,
  covers = NO_COVERS,
  showOrderAnother = true,
}: {
  orders: readonly BookOrder[];
  /**
   * `waMeHref(settings.contact.whatsapp)` — `null` when no support number is
   * configured, and the link is then simply absent. A «كلّم الدعم» button that
   * opens WhatsApp's own marketing page is a bug this repo has shipped once
   * already; see `waMeHref`'s own note.
   */
  supportHref: string | null;
  /** `bookCoverIndex(catalog)` — the live books' covers. Empty means every
   *  line draws its placeholder, never a broken image. */
  covers?: BookCoverIndex;
  /**
   * «اطلب كتاب تاني» at the foot. Off on his «Cinema» home, where the shop
   * left the page on purpose («شيل قسم الكتب»): the box is there to say where
   * the book is, and a selling link under it would bring the shop back by
   * the side door.
   */
  showOrderAnother?: boolean;
}) {
  /*
   * Nothing at all, not an empty state. This section is an addition to a screen
   * that was complete without it: a student with no book on its way must see
   * the page exactly as it was.
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
          <BookOrderCard key={order.id} order={order} supportHref={supportHref} covers={covers} />
        ))}
      </ul>

      {/*
        «يقدر يطلب كتاب تاني» — worded as an ADDITION and never as a retry.
        Outlined amber, not filled: the card above may already carry the one
        filled action on this part of the page.
      */}
      {showOrderAnother ? (
        <div className="mt-4">
          <Link href="/books" className="chip chip--accent">
            {c.orderAnother}
          </Link>
        </div>
      ) : null}
    </section>
  );
}

/**
 * ONE order, everywhere it is shown — the box.
 *
 * Exported and reused verbatim by `/store/orders` rather than being written
 * twice at two densities: two renderings of one order are two chances for the
 * home to say «في الطريق» while the history page says «وصل» about the same row.
 *
 * ## What the box is, top to bottom
 *
 * 1. the BOOK — its cover, its title × quantity — because «كتبي» is about the
 *    thing on its way, and a picture of it is what makes the box recognisable
 *    at a glance among the rest of the home;
 * 2. the tracker — «اتطلب ← اتدفع ← بيتطبع ← استلمته شركة الشحن ← وصل», done
 *    stages with their dates, the current one in the status colour, the rest
 *    muted (`bookOrderStages` decides which is which);
 * 3. what the state means (the existing reassurance line) and the money;
 * 4. at most ONE action — «إكمال الدفع», «استلمت الكتاب» or «كلّم الدعم». The
 *    three are mutually exclusive by status, so the card never asks two things
 *    of the student at once.
 *
 * Styled in `my-book-orders.css` (`.bo-*`), not with the `.site-*` marketing
 * classes `/books` is built from — those live under `(site)/styles/*.css`,
 * which the app shell does not import.
 */
export function BookOrderCard({
  order,
  supportHref,
  covers = NO_COVERS,
}: {
  order: BookOrder;
  supportHref: string | null;
  covers?: BookCoverIndex;
}) {
  const status = describeBookOrderStatus(order.status);
  const stages = bookOrderStages(order);

  return (
    <li
      className="bo-card"
      data-status={order.status}
      /* One token reference painted everywhere the state shows — chip, current
         step, stop marker, reason — so they cannot drift apart. */
      style={{ ['--tone' as string]: status.tone } as CSSProperties}
    >
      <div className="bo-card__head">
        <BookCovers lines={order.items} covers={covers} />

        <div className="bo-card__titles">
          <div className="bo-card__meta">
            <span className="bo-chip">{status.label}</span>
            <time dateTime={bookOrderDate(order)} className="bo-card__date">
              {formatCopy(c.placedOn, { date: formatBookOrderDate(bookOrderDate(order)) })}
            </time>
          </div>

          {/*
            `<StreamBadge>` only when the line still HAS a stream: `forGeneral`
            and `forLanguages` are nullable together on `BookOrderLineSchema` —
            a line an admin typed by hand, or one whose book row was deleted —
            and rendering «عام» for a null is inventing a fact about a printed
            object.

            No per-line price here: the box answers «فين كتابي», and the money
            sits once, in full, in the breakdown below.
          */}
          <ul className="bo-lines">
            {order.items.map((line, index) => (
              <li key={line.bookId ?? `${index}-${line.titleAr}`} className="bo-line">
                <span className="bo-line__title">{line.titleAr}</span>
                {line.quantity > 1 ? (
                  <span className="bo-line__qty">
                    {formatCopy(c.lineQuantity, { quantity: line.quantity })}
                  </span>
                ) : null}
                {line.forGeneral !== null && line.forLanguages !== null ? (
                  <StreamBadge forGeneral={line.forGeneral} forLanguages={line.forLanguages} />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bo-card__body">
        <ol className="bo-track" aria-label={c.trackerLabel}>
          {stages.map((stage) => (
            <TrackStep key={stage.key} stage={stage} order={order} closed={status.closed} />
          ))}
        </ol>

        <div className="bo-card__side">
          {/* The reassurance line — «أوقات الكتاب بيتأخر، طمّنه». The tracker
              says WHERE; this says what it means and what happens next. */}
          <p className="bo-card__note">{status.note}</p>

          {/*
            The admin's own words, VERBATIM, under a prefix that marks them as a
            quote and not as ours — the same rule `payment_rejected` follows in
            the notification feed. Non-null exactly when `rejectedAt` is (a
            database CHECK), so this never renders an empty «السبب:».
          */}
          {order.rejectionReason ? (
            <p className="bo-card__reason">
              <span className="bo-card__reason-label">{c.rejectionReason}</span>{' '}
              <span className="font-[var(--fw-medium)]">{order.rejectionReason}</span>
            </p>
          ) : null}

          {/*
            Four numbers rather than one — «٥٦٥ جنيه» with nothing explaining
            the ٦٥ is the commonest reason somebody calls to ask whether they
            were overcharged. `total = items + shipping − discount` is a CHECK
            constraint, so these cannot disagree with the row.

            `formatShipping` on the shipping row: a zero fee is a real, chosen
            configuration, and `0` beside a currency word reads as a number
            that failed to load.
          */}
          <dl className="bo-money">
            <div className="bo-money__row">
              <dt>{b.subtotal}</dt>
              <dd>{formatEGP(order.itemsCents)}</dd>
            </div>
            <div className="bo-money__row">
              <dt>{b.shipping}</dt>
              <dd>{formatShipping(order.shippingCents, b.shippingFree)}</dd>
            </div>
            <div className="bo-money__row bo-money__row--total">
              <dt>{b.total}</dt>
              <dd>{formatEGP(order.amountCents)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <CardAction order={order} closed={status.closed} supportHref={supportHref} />
    </li>
  );
}

/**
 * The covers, fanned — up to three distinct books, then «+N».
 *
 * Decorative (`aria-hidden`): every title is printed as text right beside it,
 * and a screen reader announcing a picture of the same title would be saying
 * it twice.
 *
 * `next/image` at the slot's real size (`3.75rem`, in rem because this product
 * never sets `html { font-size }`), through `mediaUrl()` — the media origin is
 * allowlisted under `/media/**` in `next.config.ts`, so the optimizer serves a
 * small file from our own origin rather than the full upload.
 */
function BookCovers({ lines, covers }: { lines: BookOrder['items']; covers: BookCoverIndex }) {
  // One cover per BOOK, not per line: two lines of the same title (a هدية copy
  // typed by an admin) are one jacket.
  const seen = new Set<string>();
  const unique = lines.filter((line) => {
    const key = line.bookId ?? line.titleAr;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const shown = unique.slice(0, 3);
  const more = unique.length - shown.length;

  return (
    <div className="bo-covers" aria-hidden="true">
      {shown.map((line, index) => {
        const coverKey = coverForLine(line, covers);
        return (
          <span
            key={line.bookId ?? `${index}-${line.titleAr}`}
            className={coverKey ? 'bo-cover' : 'bo-cover bo-cover--blank'}
            data-cover={coverKey ? 'image' : 'placeholder'}
          >
            {coverKey ? (
              <Image src={mediaUrl(coverKey)} alt="" fill sizes="3.75rem" className="bo-cover__img" />
            ) : (
              <BookOpen className="size-6" strokeWidth={1.6} />
            )}
          </span>
        );
      })}
      {more > 0 ? <span className="bo-cover__more">+{more}</span> : null}
    </div>
  );
}

/**
 * One stage of the tracker.
 *
 * The courier's latest word rides under the stage the order is ON — while it
 * is out, that is «استلمته شركة الشحن», and the line reads «في الطريق — …»: the
 * one span of the journey the student cannot otherwise see, between the
 * pickup and the knock on the door. Only while the order is still moving; on a
 * delivered or rejected order the courier's last word is history the tracker
 * already tells better.
 */
function TrackStep({
  stage,
  order,
  closed,
}: {
  stage: BookOrderStage;
  order: BookOrder;
  closed: boolean;
}) {
  const here = stage.state === 'current' || stage.state === 'stopped';

  return (
    <li
      className="bo-step"
      data-state={stage.state}
      data-stage={stage.key}
      aria-current={stage.state === 'current' ? 'step' : undefined}
    >
      <span className="bo-step__dot" aria-hidden="true">
        {stage.state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : null}
        {stage.key === 'rejected' ? <X className="size-3.5" strokeWidth={3} /> : null}
        {stage.key === 'returned' ? <RotateCcw className="size-3.5" strokeWidth={3} /> : null}
      </span>

      <span className="bo-step__text">
        <span className="bo-step__row">
          <span className="bo-step__label">{stage.label}</span>
          {stage.date ? (
            <time dateTime={stage.date} className="bo-step__date">
              {formatBookOrderDate(stage.date)}
            </time>
          ) : null}
        </span>

        {here && !closed ? <LiveLine order={order} /> : null}
      </span>
    </li>
  );
}

/**
 * «في الطريق — {what the courier last said}», and who is carrying it.
 *
 * On a shipped order the line is there even before the courier's first
 * update — «في الطريق» on its own — because that IS the state. On any other
 * open order it appears only if the courier has said something (a return, or
 * a parcel registered before the admin pressed «اتشحن»), under the courier's
 * own prefix. The agent's number is isolated LTR, or it reverses inside
 * Arabic.
 */
function LiveLine({ order }: { order: BookOrder }) {
  const courier = order.courier;
  if (order.status !== 'shipped' && !courier) return null;

  const headline = courier
    ? formatCopy(order.status === 'shipped' ? c.onTheWayWith : c.courierStatus, {
        status: courier.statusName,
      })
    : c.onTheWay;

  return (
    <span className="bo-step__live">
      <span>{headline}</span>
      {courier?.note ? <span className="bo-step__live-note"> — {courier.note}</span> : null}
      {courier?.agentName ? (
        <span className="bo-step__agent">
          {formatCopy(c.courierAgent, { name: courier.agentName })}
          {courier.agentPhone ? (
            <>
              {' · '}
              <a href={`tel:${courier.agentPhone}`} dir="ltr" className="bo-phone">
                {courier.agentPhone}
              </a>
            </>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The card's ONE action, chosen by status — never two.
 *
 * - `address_only` → «إكمال الدفع», a link to the order's pay page (a
 *   navigation, so a link: long-press, new tab and the back button all work).
 *   The page re-checks the order is theirs and still unpaid before drawing.
 * - `shipped` → «استلمت الكتاب». The parcel is out and only the student
 *   holding it can say it arrived; see the button's own note.
 * - delivered / rejected → «كلّم الدعم», only when a number is configured. An
 *   order still moving has nothing a support chat could add that the note
 *   does not already say. A plain `<a>`: it leaves the product, so no
 *   prefetch.
 */
function CardAction({
  order,
  closed,
  supportHref,
}: {
  order: BookOrder;
  closed: boolean;
  supportHref: string | null;
}) {
  if (order.status === 'address_only') {
    return (
      <div className="bo-card__action">
        <Link href={`${MY_BOOK_ORDERS_HREF}/${order.id}/pay`} className="bo-pay">
          {c.resumeCta}
        </Link>
      </div>
    );
  }

  if (order.status === 'shipped') return <BookOrderReceivedButton orderId={order.id} />;

  if (closed && supportHref) {
    return (
      <div className="bo-card__action">
        <a href={supportHref} target="_blank" rel="noopener noreferrer" className="bo-support">
          {c.support}
        </a>
      </div>
    );
  }

  return null;
}
