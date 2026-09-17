import Link from 'next/link';
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
import {
  DeliverAction,
  MarkOrderFreeAction,
  RejectOrderAction,
  RemoveOrderAction,
  RestoreOrderAction,
} from './order-actions';
import { ShipAction } from './ship-action';
import { PrintAction } from './print-action';
import { OrderCheckbox } from './bulk-ship';
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
 * ## The actions are still real, labelled buttons
 *
 * Unchanged and deliberately so: this screen is used with a phone against one
 * ear, and a kebab menu that hides «وصل» behind a click is a kebab that gets
 * pressed wrong. What is new is that they sit in their own bar at the FOOT of
 * the card rather than floating beside the address — five labelled buttons and
 * an address competing for the same row is what made the old layout wrap into
 * a different shape on every card.
 */

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
        'inline-flex items-center rounded-full border border-line-subtle bg-surface-3 px-2 py-0.5',
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
  const copies = row.items.reduce((sum, item) => sum + item.quantity, 0);
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
        {/* ── WHO, and what state ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-start gap-3">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full border border-line-subtle bg-surface-3 text-[length:var(--fs-text-sm)] font-semibold text-fg-muted"
          >
            {initial}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {/* The order's OWN `fullName` is the source of truth for shipping
                  whether or not an account exists — a linked account only adds
                  a link, never the displayed name. A guest gets a plain label
                  rather than a dead link to `/admin/students/null`. */}
              {row.userId ? (
                <Link
                  href={`/admin/students/${row.userId}`}
                  className="text-[length:var(--fs-title-4)] font-semibold text-fg underline decoration-dotted decoration-fg-faint underline-offset-4 hover:text-accent-text hover:decoration-solid"
                >
                  {row.fullName}
                </Link>
              ) : (
                <span className="text-[length:var(--fs-title-4)] font-semibold text-fg">
                  {row.fullName}
                </span>
              )}

              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[length:var(--fs-text-xs)] font-medium leading-none"
                style={{
                  color: tone,
                  background: `color-mix(in oklch, ${tone}, transparent 88%)`,
                  boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${tone}, transparent 65%)`,
                }}
              >
                {STATUS_LABEL[row.status]}
              </span>

              {/* «مجاني» beside the status and never instead of it: a giveaway
                  is still shipped, delivered or rejected like any other parcel,
                  and without this the row is a 0 ج sale that reads as a data
                  error. */}
              {row.isFree ? (
                <Chip className="!border-accent/40 !bg-accent/10 !text-accent-text">
                  {c.freeBadge}
                </Chip>
              ) : null}

              {/*
                «أعرف إن الراجل ده طلب كتاب قبل كده ولا لأ» — counted on the
                PHONE, because guest checkout means one person is several
                unlinked rows. Coloured, because it is the one chip here that
                changes how you treat the call.

                A LINK and not a plain chip, which is the whole of this change:
                the count raises a question it cannot itself answer — WHICH
                orders, and did they arrive? — and leaving the admin to retype
                the number into the search box was the gap. `status=all`,
                because the previous order worth seeing is usually one that
                already shipped and the default tab hides it; and `q` is the
                phone rather than the name because two students share a name
                far more often than they share a number.
              */}
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

              {/* The status chip beside it still says «مدفوعة» — that is the
                  point of a soft delete: the row keeps the state it was hidden
                  IN. */}
              {row.deletedAt ? (
                <Chip className="!border-[color:var(--err)] !bg-transparent !font-medium !text-[color:var(--err)]">
                  {c.removedBadge}
                </Chip>
              ) : null}
            </div>

            {row.courseTitle ? (
              <p className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-faint">
                {row.courseTitle}
              </p>
            ) : null}
          </div>

          {/* The money, right-aligned and readable at a glance — the number the
              phone call is usually about. The breakdown sits under it because
              «الشحن ٦٥» is the part people query, and an admin answering that
              call should not have to open the editor for it. */}
          <div className="text-end">
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
            {/* ٠ ج with nobody having said «مجاني». `unitPriceCents` allows 0,
                so an order typed with the price left blank lands here — and
                before the «مجاني» switch existed that was the only way to
                record a giveaway, so these rows are real. The badge IS the
                button that answers the question it asks. */}
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
                    كتاب» is read off this column, and buried mid-sentence in
                    «×٢» it was the easiest number on the card to miss. */}
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-4 text-[length:var(--fs-text-xs)] font-semibold tabular-nums text-fg">
                  {item.quantity}
                </span>
                <span className="min-w-0 flex-1 text-[length:var(--fs-text-sm)] font-medium text-fg">
                  {item.titleAr}
                </span>
                {/* الصف and الطبعة sit ON the line they describe — one delivery
                    can hold a لغات book and a عام one, and the person packing
                    the box needs to know which is which. */}
                {yearWord ? <Chip>{formatCopy(c.yearOption, { year: yearWord })}</Chip> : null}
                {stream ? (
                  <StreamBadge forGeneral={stream.forGeneral} forLanguages={stream.forLanguages} />
                ) : null}
                <span className="text-[length:var(--fs-text-xs)] tabular-nums text-fg-faint">
                  {formatEGP(item.unitPriceCents * item.quantity)} ج
                </span>
              </li>
            );
          })}
          {/* An order with NO lines still says so, rather than rendering an
              empty block that reads as a loading state. Rare (a hand-edited
              order whose last line was removed) and real — the address is
              genuine and somebody is waiting for a parcel. */}
          {row.items.length === 0 ? (
            <li className="rounded-lg border border-dashed border-line bg-surface-3/60 px-3 py-2 text-[length:var(--fs-text-sm)] text-fg-muted">
              {formatCopy(c.itemsSummary, { n: 0, copies: 0 })}
            </li>
          ) : null}
        </ul>

        {/* ── WHERE it goes ───────────────────────────────────────────── */}
        <p className="rounded-lg border border-line-subtle bg-surface-3/40 px-3 py-2 text-[length:var(--fs-text-sm)] leading-relaxed text-fg">
          {formatCopy(c.addressLine, {
            name: row.fullName,
            governorate: row.governorateNameAr,
            city: row.city,
            street: row.addressStreet,
          })}
          {row.addressBuilding
            ? formatCopy(c.addressLineBuilding, { building: row.addressBuilding })
            : ''}
          {row.addressNote ? ` — ${row.addressNote}` : ''}
        </p>

        {row.adminNote ? (
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
            <span className="font-medium text-fg">{c.adminNoteLabel}: </span>
            {row.adminNote}
          </p>
        ) : null}

        {/* The two reasons, and they are not the same kind of thing. The
            rejection is what the STUDENT was told, word for word — an admin
            answering «ليه اترفض طلبي؟» must be able to read back exactly what
            was sent. The deletion reason is internal and nobody outside this
            screen has ever seen it. */}
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

        {/* ── The quiet metadata line ─────────────────────────────────── */}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-faint">
          <span dir="ltr">{row.phone}</span>
          <span dir="ltr">
            {c.altPhoneLabel}: {row.altPhone}
          </span>
          {/* ALWAYS rendered, in one of three wordings. It used to disappear
              when `senderPhone` was null, and an absent line is
              indistinguishable from a missing feature — «فين الرقم اللي هعرف
              إنه دفعله منه؟» on an order that was simply never paid for. */}
          {row.senderPhone ? (
            <span dir="ltr">
              {c.senderPhoneLabel}: {row.senderPhone}
            </span>
          ) : (
            <span>
              {c.senderPhoneLabel}:{' '}
              {row.status === 'address_only' ? c.senderPhoneUnpaid : c.senderPhoneManual}
            </span>
          )}
          <span>{formatCopy(c.itemsSummary, { n: row.items.length, copies })}</span>
          <time dateTime={row.createdAt}>{dateFormatter.format(new Date(row.createdAt))}</time>
        </p>

        {/*
          ── The action bar ────────────────────────────────────────────────
          Real, labelled buttons — one per thing that can be done to this row,
          in the order the work flows: fix it, send it to the printer, ship it,
          confirm it arrived, turn it down, hide it. Not an icon-only overflow
          menu: this screen is used with a phone against one ear.

          Its own row at the FOOT of the card rather than floating beside the
          address, which is what made every card wrap into a different shape.
        */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle pt-3">
          {row.hasScreenshot ? (
            <BookOrderScreenshotThumbnail
              id={row.id}
              alt={formatCopy(c.screenshotAlt, { student: row.fullName })}
            />
          ) : null}

          {/* `row.phone` — the order's OWN contact number, always present
              whether or not an account exists — is the right number to reach
              about THIS delivery, not the account holder's `studentPhone`. */}
          <WhatsappButton phone={row.phone} label={c.whatsapp} size="sm" />

          {row.deletedAt ? (
            /* A hidden row has exactly one thing you can do to it. Editing or
               shipping something that is in no working list is an action whose
               result nobody would see. */
            <RestoreOrderAction id={row.id} />
          ) : (
            <>
              {/* «أعدل» first because it is the one that is reversible. */}
              <EditBookOrderDialog order={row} books={books} governorates={governorates} />

              {/* Only on rows a batch can act on — a checkbox on a delivered
                  order is a control whose only outcome is «اتشحن قبل كده».
                  `printing` is in the set because it both ships AND is what
                  «ابعت للمطبعة» produces, so a re-selected row is skipped
                  rather than un-tickable. */}
              {row.status === 'paid' || row.status === 'printing' || row.status === 'shipped' ? (
                <OrderCheckbox id={row.id} label={row.fullName} />
              ) : null}

              {/* «راح للمطبعة» — only from `paid`, which is the only state it
                  moves. See `markPrinting` for why it is not reachable from a
                  parcel that has already left. */}
              {row.status === 'paid' ? <PrintAction id={row.id} /> : null}

              {/* Ships from `paid` directly as well as from `printing`: a
                  single reprint handed over the counter never sees a run. */}
              {row.status === 'paid' || row.status === 'printing' ? (
                <ShipAction id={row.id} />
              ) : null}

              {/* On the pre-courier states as well as `shipped`: Ayman delivers
                  some of these himself, and those never pass through «اتشحن». */}
              {row.status === 'paid' || row.status === 'printing' || row.status === 'shipped' ? (
                <DeliverAction id={row.id} />
              ) : null}

              {/* Not on a delivered order — a book in the student's hands
                  cannot be turned down — and not on one already rejected. */}
              {row.status !== 'delivered' && row.status !== 'rejected' ? (
                <RejectOrderAction id={row.id} />
              ) : null}

              <RemoveOrderAction id={row.id} />
            </>
          )}
        </div>
      </div>
    </li>
  );
}
