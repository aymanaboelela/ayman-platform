import { copy } from '@ayman/contracts/copy';
import type { BookOrderStatus } from '@ayman/contracts/book-orders';

/**
 * «الطالب يعرف إن الكتاب جاي له» — one order's STATE, turned into the two
 * sentences a worried student is actually looking for.
 *
 * ## Why this is a module and not a `switch` inside the card
 *
 * Three surfaces render the same five states: the dashboard section, the full
 * history page, and (through `describeBookOrderHref`) the notification that
 * brought the student to either of them. A copy of the mapping in each is three
 * places for «في الطريق» to drift into meaning three different things — and the
 * whole reason this feature exists is that the student trusts what it says.
 *
 * It is also the only piece of the slice that is testable without a render, and
 * the status→copy pairing is the part worth pinning: `noteShipped` promising a
 * delivery on a `rejected` order is not a layout bug, it is a lie.
 *
 * ## The `switch` is EXHAUSTIVE on purpose
 *
 * `BookOrderStatusSchema` grew from three members to five in the same commit
 * that added `deliveredAt`/`rejectedAt`, and a `Record<BookOrderStatus, …>`
 * lookup table would have compiled the moment somebody filled in two more
 * strings — including with the wrong two. A `switch` with no `default` and a
 * declared return type makes a sixth status a compile error at the one place
 * that has to answer for it.
 *
 * ## No `next/*` imports, ever
 *
 * `notification-view.ts` imports `MY_BOOK_ORDERS_HREF` from here, and that
 * module is pulled into `<NotificationList>`, a Client Component. Anything
 * reachable from this file lands in the browser bundle, so it holds copy and
 * pure functions and nothing else — the fetch lives in `lib/my-book-orders.ts`,
 * which imports `next/headers` and is server-only.
 */

const c = copy.books.mine;

/**
 * Where «كتبي» lives.
 *
 * A constant rather than three literals because the dashboard section, the
 * three book-order notifications and the empty state all have to land on the
 * same page — and a notification that says «كتبي» and opens the shop is worse
 * than no notification at all.
 *
 * ⚠️ NOT `/books`: `app/(site)/books/page.tsx` already owns
 * `/books` (the shop, marketing chrome, `.site-*` CSS). Two route groups may
 * not resolve to one URL, so the history page is a segment UNDER it, inside the
 * app shell where a signed-in student already is.
 */
/**
 * ⚠️ `/store/orders`, under the SHOP — not `/books/mine` beside it.
 *
 * This page shipped at `/books/mine` and `(app)/store` landed on `main` the
 * same evening: the in-app bookshop, with «الكتب» in the student rail pointing
 * at it. Two sibling app routes about books is a student wondering which one is
 * theirs, and a rail item that lights on one and not the other. The history
 * belongs UNDER the shop it is a history of — `/store` sells, `/store/orders`
 * says what you already bought — and the nav's longest-prefix match then lights
 * «الكتب» on both without an alias.
 *
 * `push-text.ts`'s own `BOOK_ORDERS_URL` must stay equal to this. Nothing
 * enforces it across the two packages, so it is stated in both docblocks.
 */
export const MY_BOOK_ORDERS_HREF = '/store/orders';

export interface BookOrderStatusView {
  /** The chip. One word — the sentence under it does the explaining. */
  label: string;
  /**
   * The reassurance line. «أوقات الكتاب بيتأخر، طمّنه» — every one of these is
   * written for somebody who is already slightly worried, so none promises a
   * date and none ends without saying what happens next.
   */
  note: string;
  /**
   * The chip's colour, as a token REFERENCE the card paints with.
   *
   * Deliberately not amber: amber is this product's action colour (see
   * `<StreamBadge>`'s own note on the same decision), and a status a student
   * cannot act on wearing the colour of a button is how «في الطريق» starts
   * reading as something to press.
   */
  tone: string;
  /**
   * Whether the order is FINISHED — arrived, or turned down.
   *
   * Both of those are the moments «كلّم الدعم» is worth offering and the two
   * where it is not noise: an order still moving has nothing a support chat
   * could add that this card does not already say.
   */
  closed: boolean;
}

export function describeBookOrderStatus(status: BookOrderStatus): BookOrderStatusView {
  switch (status) {
    /* The student filled in the address and never came back to the transfer.
       The only one of the five where the next move is THEIRS, which is why it
       is the only one wearing `--warn`. */
    case 'address_only':
      return {
        label: c.statusAddressOnly,
        note: c.noteAddressOnly,
        tone: 'var(--warn)',
        closed: false,
      };

    case 'paid':
      return { label: c.statusPaid, note: c.notePaid, tone: 'var(--info)', closed: false };

    /* Ember rather than a second blue: `paid` and `shipped` are the two states
       a student checks back on most, and they sit one above the other in a
       history list where telling them apart at a glance is the entire job. */
    case 'shipped':
      return { label: c.statusShipped, note: c.noteShipped, tone: 'var(--e-ink)', closed: false };

    case 'delivered':
      return { label: c.statusDelivered, note: c.noteDelivered, tone: 'var(--ok)', closed: true };

    /* `noteRejected` is only the LEAD-IN — the admin's own words follow it
       verbatim on the card, under `c.rejectionReason`. Same rule
       `payment_rejected` follows, for the same reason: a reason paraphrased by
       the platform is a reason the student argues with instead of acting on. */
    case 'rejected':
      return { label: c.statusRejected, note: c.noteRejected, tone: 'var(--err)', closed: true };
  }
}

/**
 * An ABSOLUTE date, in the same Western digits every other number on the
 * platform uses (`-u-nu-latn`) — see `formatNotificationTime` for the longer
 * argument against a relative "من ٣ أيام" here.
 *
 * `dateStyle: 'medium'` and no time: an order was shipped on a DAY, and a
 * courier handover printed to the minute invites a precision the platform
 * cannot honour.
 */
const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' });

export function formatBookOrderDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}
