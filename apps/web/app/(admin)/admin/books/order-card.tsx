import Link from 'next/link';
import { MapPin, Phone } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { AdminBookOrderRow } from '@ayman/contracts/admin/book-orders';
import { bookOrderYearWord } from '@ayman/contracts/admin/book-orders';
import type { AdminBookRow } from '@ayman/contracts/admin/books';
import type { BookOrderStatus } from '@ayman/contracts/book-orders';
import { cn } from '@ayman/ui';
import { formatEGP } from '@/lib/price';
import { StreamBadge } from '@/components/stream-badge';
import { WhatsappButton } from '@/components/admin/whatsapp-button';
import { bookLineStream } from './line-stream';
import { DeliverAction, MarkOrderFreeAction, RestoreOrderAction } from './order-actions';
import { MarkOrderPaidDialog } from './mark-paid-dialog';
import { ShipAction } from './ship-action';
import { HeldBanner } from './held-banner';
import { PrintAction } from './print-action';
import { OrderCheckbox } from './bulk-ship';
import { CourierChip, CourierPanel, SendToCourierAction } from './courier-actions';
import { OrderMoreMenu } from './order-more-menu';
import { BookOrderScreenshotThumbnail } from './screenshot-thumbnail';
import { EditBookOrderDialog } from './edit-order-dialog';

const c = copy.admin.books;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE ORDER, as a card.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ## Why this is a file of its own now
 *
 * It was ~250 lines inline inside `page.tsx`, which also owns the fetches, the
 * filters, the year split and the pager. Pulling the row out is what makes the
 * page readable enough to lay two columns of them side by side at all — and
 * the card is the piece this screen is judged on, so it deserves to be edited
 * without scrolling past four `searchParams` parsers to reach it.
 *
 * ## What changed, and why
 *
 * «بجد شكله معفن أوي» — the previous row was an undifferentiated wall: seven
 * grey pills of identical weight on one line, then five lines of grey text at
 * the same size, then a strip of buttons. Nothing told you where to look, and
 * the two things actually read off this screen (WHO, and WHAT STATE) were the
 * two hardest to find.
 *
 * Three changes carry the whole difference:
 *
 *   1. **A status stripe down the leading edge**, coloured per state. It is the
 *      only full-height element on the card, so a column of forty answers «فين
 *      اللي لسه ماتشحنتش» by shape rather than by reading. The same colour
 *      tints the status pill, so the stripe is legible as a status and not as
 *      decoration.
 *   2. **A typographic hierarchy that matches how the card is used.** The name
 *      is the largest thing on it and the only link; the BOOKS are next,
 *      because «كل واحد عايز كام كتاب» is the second question; the address is a
 *      quiet block with its own background because it is copied, not scanned;
 *      the metadata line (phones, dates) is the smallest and last.
 *   3. **Chips that mean different things look different.** الصف and الطبعة are
 *      DATA and sit on the book line they describe. «طلب قبل كده» and «مجاني»
 *      change how you treat the call and stay coloured. Everything else stopped
 *      being a pill.
 *
 * ## One big button: the next step
 *
 * «لو فيه زراير مالهاش لازمة أشيلها». The foot of the card carried nine
 * controls — the next step the same size as «احذف», and «اتشحن» on rows where
 * it was not the next step at all. Now it carries the ONE action the row is
 * waiting for, large and coloured by what it does (violet «ابعت للمطبعة»,
 * green «اتشحن», blue «وصل»), beside «تعديل» and «واتساب». The rare ones —
 * shipping without a print run, a hand delivery, reject, delete — are still
 * one click away under «المزيد», labelled, never icon-only.
 *
 * The checkbox moved to the head of the card, where a column of them reads as
 * a column rather than as one control lost among nine.
 */

/**
 * The tabs a batch can still move a row along from — the checkbox shows there.
 */
const BATCHABLE_STATUS: ReadonlySet<BookOrderStatus> = new Set(['paid', 'printing', 'shipped']);

/**
 * Each state's colour, as a CSS value the card paints the stripe and the pill
 * with.
 *
 * `Record<BookOrderStatus, …>` on purpose: a seventh status added to the
 * contract is a compile error here rather than a card that silently renders a
 * transparent stripe. The palette is the same one `describeBookOrderStatus`
 * gives the student, so a state is the same colour on both sides of the
 * platform — except that here `printing` gets a colour of its own, because an
 * admin DOES act differently on it and a student does not.
 */
const STATUS_TONE: Record<BookOrderStatus, string> = {
  address_only: 'var(--warn)',
  paid: 'var(--info)',
  printing: 'oklch(0.55 0.16 300)',
  shipped: 'var(--e-ink)',
  delivered: 'var(--ok)',
  rejected: 'var(--err)',
};

const STATUS_LABEL: Record<BookOrderStatus, string> = {
  address_only: c.statusAddressOnly,
  paid: c.statusPaid,
  printing: c.statusPrinting,
  shipped: c.statusShipped,
  delivered: c.statusDelivered,
  rejected: c.statusRejected,
};

const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** A quiet chip — DATA about a line, never an action. */
function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border border-line-subtle bg-surface-3 px-2 py-0.5',
        'text-[length:var(--fs-text-xs)] leading-none text-fg-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function BookOrderCard({
  row,
  books,
  governorates,
  /** Shown when this order holds books from more than one صف — it is rendered
   *  once, under the lowest year it touches, and this badge is what says the
   *  rest of it is somewhere in the box. Without it the «سنة أولى» column looks
   *  like it is claiming the whole parcel. */
  multiYear = false,
}: {
  row: AdminBookOrderRow;
  books: AdminBookRow[];
  governorates: Array<{ code: string; nameAr: string }>;
  multiYear?: boolean;
}) {
  const tone = STATUS_TONE[row.status];
  /* The first letter of the name, as the card's only piece of "identity". Not a
     photo: a book order is frequently a guest with no account and therefore no
     avatar, and half a column of initials beside half a column of blanks is
     worse than a column of initials. */
  const initial = row.fullName.trim().charAt(0) || '؟';

  return (
    <li
      className={cn(
        'relative overflow-hidden rounded-xl border bg-surface-2 transition-colors duration-[160ms] ease-out',
        row.deletedAt
          ? 'border-dashed border-[color-mix(in_oklch,var(--err),transparent_55%)] bg-surface-2/60'
          : 'border-line hover:border-line-strong',
      )}
    >
      {/*
        The stripe.

        `start-0` (logical), never `left-0`, so it stays on the READING edge of
        an RTL screen without a second rule — and `width` inline beside the
        colour, which is already inline because it is per-status. Two halves of
        one six-pixel decision in one place beats a utility class that has to be
        read against a token table to know what it draws.
      */}
      <span
        aria-hidden
        className="absolute inset-y-0 start-0"
        style={{ width: '6px', background: tone }}
      />

      <div className="flex flex-col gap-3 p-4 ps-5">
        {/*
          «محجوز للمراجعة» — ABOVE the name, because it changes what to do with
          the whole row. A held order is already missing from the packing list
          and skipped by the bulk actions; this is the only place that says so.
        */}
        {row.heldForReviewAt ? (
          <HeldBanner
            id={row.id}
            reason={row.heldReason}
            readCents={row.screenshotAmountCents}
            owedCents={row.amountCents}
          />
        ) : null}

        {/* ── WHO, and what state ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-start gap-3">
          {!row.deletedAt && BATCHABLE_STATUS.has(row.status) ? (
            <span className="pt-2">
              <OrderCheckbox id={row.id} label={row.fullName} compact />
            </span>
          ) : null}
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-full text-[length:var(--fs-text-base)] font-semibold"
            style={{
              color: tone,
              background: `color-mix(in oklch, ${tone}, transparent 86%)`,
            }}
          >
            {initial}
          </span>

          <div className="min-w-0 flex-1">
            {/* The order's OWN `fullName` is the source of truth for shipping
                whether or not an account exists — a linked account only adds a
                link. A guest gets a plain label rather than a dead link. */}
            {row.userId ? (
              <Link
                href={`/admin/students/${row.userId}`}
                className="text-[length:var(--fs-title-4)] font-semibold text-fg hover:text-accent-text"
              >
                {row.fullName}
              </Link>
            ) : (
              <span className="text-[length:var(--fs-title-4)] font-semibold text-fg">{row.fullName}</span>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[length:var(--fs-text-xs)] font-medium leading-none"
                style={{
                  color: tone,
                  background: `color-mix(in oklch, ${tone}, transparent 88%)`,
                  boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${tone}, transparent 65%)`,
                }}
              >
                {STATUS_LABEL[row.status]}
              </span>
              {/* Is the courier coming for this box? Only asked where it is
                  live — see `CourierChip`. */}
              <CourierChip row={row} />

              {/* «مجاني» beside the status and never instead of it: a giveaway
                  is still shipped like any other parcel. */}
              {row.isFree ? (
                <Chip className="!border-accent/40 !bg-accent/10 !text-accent-text">{c.freeBadge}</Chip>
              ) : null}

              {/* «أعرف إن الراجل ده طلب كتاب قبل كده ولا لأ» — counted on the
                  PHONE (guest checkout means one person is several unlinked
                  rows), and a LINK to those orders because the count raises a
                  question it cannot answer by itself. */}
              {row.previousOrdersFromPhone > 0 ? (
                <Link
                  href={`/admin/books?status=all&q=${encodeURIComponent(row.phone)}`}
                  title={c.repeatCustomerHint}
                  className="rounded-full border border-accent/50 bg-accent/10 px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium text-accent-text transition-colors duration-[160ms] ease-out hover:border-accent hover:bg-accent/20"
                >
                  {formatCopy(c.repeatCustomer, { n: row.previousOrdersFromPhone })}
                </Link>
              ) : null}

              {!row.userId ? <Chip>{c.guestLabel}</Chip> : null}

              {multiYear ? (
                <Chip className="!border-[color-mix(in_oklch,var(--warn),transparent_55%)] !bg-[color-mix(in_oklch,var(--warn),transparent_90%)] !text-[color:var(--warn)]">
                  {c.multiYearBadge}
                </Chip>
              ) : null}

              {/* The status chip beside it keeps the state the row was hidden
                  IN — that is the point of a soft delete. */}
              {row.deletedAt ? (
                <Chip className="!border-[color:var(--err)] !bg-transparent !font-medium !text-[color:var(--err)]">
                  {c.removedBadge}
                </Chip>
              ) : null}
            </div>
          </div>

          {/* The money — the number the phone call is usually about. The
              breakdown under it because «الشحن ٦٥» is the part people query. */}
          {/* On a phone it drops under the name — beside it, a 390px card left
              the name three words wide and the chips one word per line. */}
          <div className="shrink-0 text-end max-sm:order-last max-sm:w-full max-sm:text-start">
            <p className="text-[length:var(--fs-title-4)] font-semibold tabular-nums text-fg">
              {formatEGP(row.amountCents)} ج
            </p>
            <p className="text-[length:var(--fs-text-xs)] tabular-nums text-fg-faint">
              {formatCopy(row.discountCents > 0 ? c.breakdownWithDiscount : c.breakdown, {
                items: formatEGP(row.itemsCents),
                shipping: formatEGP(row.shippingCents),
                discount: formatEGP(row.discountCents),
                total: formatEGP(row.amountCents),
              })}
            </p>
            {/* ٠ ج with nobody having said «مجاني» — the badge IS the button
                that answers the question it asks. */}
            {!row.isFree && row.amountCents === 0 ? (
              <span className="mt-1 inline-block">
                <MarkOrderFreeAction id={row.id} />
              </span>
            ) : null}
          </div>
        </div>

        {/* ── WHAT is in the box ──────────────────────────────────────── */}
        <ul className="flex flex-col gap-1.5">
          {row.items.map((item, index) => {
            const stream = bookLineStream(item, row);
            const year = item.year ?? row.courseYear;
            const yearWord = year != null && year >= 1 && year <= 3 ? bookOrderYearWord(year) : null;
            return (
              <li
                key={`${item.bookId ?? 'custom'}-${index}`}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-3/60 px-3 py-2"
              >
                {/* The quantity FIRST and as its own object — «كل واحد عايز كام
                    كتاب» is read off this column. */}
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-4 text-[length:var(--fs-text-xs)] font-semibold tabular-nums text-fg">
                  {item.quantity}
                </span>
                <span className="min-w-0 flex-1 text-[length:var(--fs-text-sm)] font-medium text-fg">
                  {item.titleAr}
                </span>
                {yearWord ? <Chip>{formatCopy(c.yearOption, { year: yearWord })}</Chip> : null}
                {stream ? <StreamBadge forGeneral={stream.forGeneral} forLanguages={stream.forLanguages} /> : null}
              </li>
            );
          })}
          {/* An order with NO lines still says so, rather than rendering an
              empty block that reads as a loading state. */}
          {row.items.length === 0 ? (
            <li className="rounded-lg border border-dashed border-line bg-surface-3/60 px-3 py-2 text-[length:var(--fs-text-sm)] text-fg-muted">
              {formatCopy(c.itemsSummary, { n: 0, copies: 0 })}
            </li>
          ) : null}
        </ul>

        {/* ── WHERE it goes, and how to reach them ─────────────────────── */}
        <div className="flex flex-col gap-1.5 text-[length:var(--fs-text-sm)]">
          <p className="flex items-start gap-2 leading-relaxed text-fg">
            <MapPin className="mt-1 size-4 shrink-0 text-fg-faint" aria-hidden />
            <span>
              {formatCopy(c.addressPlace, {
                governorate: row.governorateNameAr,
                city: row.city,
                street: row.addressStreet,
              })}
              {row.addressBuilding ? formatCopy(c.addressLineBuilding, { building: row.addressBuilding }) : ''}
              {row.addressNote ? <span className="text-fg-muted"> — {row.addressNote}</span> : null}
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
            <Phone className="size-4 shrink-0 text-fg-faint" aria-hidden />
            <a href={`tel:${row.phone}`} dir="ltr" className="[unicode-bidi:isolate] hover:text-fg">
              {row.phone}
            </a>
            {row.altPhone && row.altPhone !== row.phone ? (
              <span>
                {c.altPhoneLabel}:{' '}
                <a href={`tel:${row.altPhone}`} dir="ltr" className="[unicode-bidi:isolate] hover:text-fg">
                  {row.altPhone}
                </a>
              </span>
            ) : null}
            {/* ALWAYS rendered, in one of three wordings — an absent line is
                indistinguishable from a missing feature. */}
            {row.senderPhone ? (
              <span>
                {c.senderPhoneLabel}:{' '}
                <span dir="ltr" className="[unicode-bidi:isolate]">
                  {row.senderPhone}
                </span>
              </span>
            ) : (
              <span>
                {c.senderPhoneLabel}: {row.status === 'address_only' ? c.senderPhoneUnpaid : c.senderPhoneManual}
              </span>
            )}
            <time dateTime={row.createdAt} className="text-fg-faint">
              {dateFormatter.format(new Date(row.createdAt))}
            </time>
          </p>
        </div>

        {/* «فين الكتاب؟» — the courier's latest word, or their refusal. */}
        <CourierPanel row={row} />

        {row.adminNote ? (
          <p className="rounded-lg bg-surface-3/60 px-3 py-2 text-[length:var(--fs-text-sm)] text-fg-muted">
            <span className="font-medium text-fg">{c.adminNoteLabel}: </span>
            {row.adminNote}
          </p>
        ) : null}

        {/* The rejection is what the STUDENT was told, word for word; the
            deletion reason is internal. Two different kinds of text. */}
        {row.rejectionReason ? (
          <p className="rounded-lg border border-[color-mix(in_oklch,var(--err),transparent_60%)] bg-[color-mix(in_oklch,var(--err),transparent_92%)] px-3 py-2 text-[length:var(--fs-text-sm)] text-fg">
            <span className="font-medium text-[color:var(--err)]">{c.rejectedReasonLabel}: </span>
            {row.rejectionReason}
          </p>
        ) : null}
        {row.deletionReason ? (
          <p className="rounded-lg border border-line-subtle bg-surface-3 px-3 py-2 text-[length:var(--fs-text-sm)] text-fg-muted">
            <span className="font-medium text-fg">{c.removedReasonLabel}: </span>
            {row.deletionReason}
          </p>
        ) : null}

        {/*
          ── The action bar ────────────────────────────────────────────────
          Start: the receipt, «واتساب», «تعديل». End: «المزيد» and the ONE
          button this row is waiting for. See the file note.
        */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle pt-3">
          {row.hasScreenshot ? (
            <BookOrderScreenshotThumbnail id={row.id} alt={formatCopy(c.screenshotAlt, { student: row.fullName })} />
          ) : null}
          <WhatsappButton phone={row.phone} label={c.whatsapp} size="sm" />
          {row.deletedAt ? null : <EditBookOrderDialog order={row} books={books} governorates={governorates} />}

          <div className="ms-auto flex flex-wrap items-center gap-2">
            {row.deletedAt ? (
              <RestoreOrderAction id={row.id} />
            ) : (
              <>
                <OrderMoreMenu id={row.id} status={row.status} />
                {row.status === 'address_only' ? (
                  <MarkOrderPaidDialog id={row.id} amountCents={row.amountCents} />
                ) : row.status === 'paid' ? (
                  <PrintAction id={row.id} />
                ) : row.status === 'printing' ? (
                  /* «لما المطبعة تخلص ببعت لشركة الشحن» — that one press also
                     records «اتشحن». Without the integration, plain «اتشحن». */
                  <SendToCourierAction id={row.id} fallback={<ShipAction id={row.id} />} />
                ) : row.status === 'shipped' ? (
                  <DeliverAction id={row.id} />
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
