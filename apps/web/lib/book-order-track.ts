import { copy } from '@ayman/contracts/copy';
import { bookOrderDate, type BookOrder } from '@ayman/contracts/book-orders';
import type { BookCatalog } from '@ayman/contracts/books';

/**
 * «الكتاب وصل لحد فين» — one order's journey as the stages a student would
 * name out loud, plus the two small decisions the box around it needs: which
 * orders deserve the home screen, and which cover goes with which line.
 *
 * ## Why a module of its own, beside `book-order-view.ts`
 *
 * Same rule that file states: no `next/*` imports, pure functions only, so the
 * stage derivation is testable without a render and could be pulled into a
 * Client Component later without dragging a server-only import into the
 * browser. `book-order-view.ts` answers «what one word and one sentence go with
 * this status»; this answers «which steps are behind it, which one is it on,
 * and what happened on which day» — a different question with a different
 * shape, and one the status alone cannot answer (a `delivered` order may or
 * may not have passed the printer).
 *
 * ## The stages are the owner's words, not the state machine's
 *
 * «هل بيتطبع، استلمته شركة الشحن، وصل» — the student does not know `paid` and
 * `printing` are two admin tabs, and does not care. They want to know whether
 * the book exists yet, whether the courier has it, and whether it arrived.
 * Five stages, in that vocabulary, and nothing an admin's workflow added.
 */

const c = copy.books.mine;

export type BookOrderStageKey =
  | 'ordered'
  | 'payment'
  | 'printing'
  | 'courier'
  | 'delivered'
  | 'returned'
  | 'rejected';

/**
 * `done` — behind it. `current` — where the order IS right now (the latest
 * stage it reached, never a guess at the next one). `upcoming` — not yet.
 * `stopped` — the journey ended off the happy path (returned, rejected); it
 * replaces every stage that would have followed.
 */
export type BookOrderStageState = 'done' | 'current' | 'upcoming' | 'stopped';

export interface BookOrderStage {
  key: BookOrderStageKey;
  label: string;
  state: BookOrderStageState;
  /** ISO, or `null` when the platform never recorded the day — rendered as
   *  no date rather than an invented one. */
  date: string | null;
}

/**
 * The tracker for one order.
 *
 * ## «current» is the stage it REACHED, not the one it is waiting for
 *
 * A `paid` order highlights «اتدفع», not «بيتطبع»: the copy has not gone to
 * the printer yet, and a highlighted «بيتطبع» would be the platform telling a
 * worried student something that is not true. The step AFTER the current one
 * is simply the first muted step, which already says «this is next».
 *
 * ## Dates
 *
 * Each stage carries the timestamp of its own event (`paidAt`, `printedAt`,
 * `shippedAt`, `deliveredAt`, `returnedAt`, `rejectedAt`). «اتطلب» carries a
 * date only while the order is unpaid, through `bookOrderDate`: once it is
 * paid, «اي تاريخ مكتوب يبقى تاريخ الدفع» (see `book-order-date.test.ts`) —
 * printing the day the address form was saved beside the day it was paid is
 * the exact three-week-old date the desk was asked never to print again.
 *
 * ## Orders that skipped a step
 *
 * `markShipped` accepts `paid` directly (a reprint handed over the counter
 * never goes near a print run) and `markDelivered` accepts `paid` too. A stage
 * the order went PAST is done whether or not its timestamp exists; it just
 * shows no date. The printing stage then reads «اتجهز» rather than «اتطبع»,
 * because «اتطبع» with no print run behind it would be a small lie.
 */
export function bookOrderStages(
  order: Pick<
    BookOrder,
    | 'status'
    | 'paidAt'
    | 'printedAt'
    | 'shippedAt'
    | 'deliveredAt'
    | 'returnedAt'
    | 'rejectedAt'
    | 'createdAt'
  >,
): BookOrderStage[] {
  /*
   * How far along the happy path the order got, 0-based over the five
   * stages. For the two end states it is how far it got BEFORE stopping,
   * read off the timestamps it actually carries.
   */
  const reached = reachedIndex(order);

  const state = (index: number): BookOrderStageState =>
    index < reached ? 'done' : index === reached ? 'current' : 'upcoming';

  const printingLabel =
    reached > 2 ? (order.printedAt ? c.stagePrinted : c.stagePrepared) : c.stagePrinting;

  const happy: BookOrderStage[] = [
    {
      key: 'ordered',
      label: c.stageOrdered,
      state: state(0),
      date: order.paidAt ? null : bookOrderDate(order),
    },
    {
      key: 'payment',
      label: order.status === 'address_only' ? c.stageAwaitingTransfer : c.stagePaid,
      state: state(1),
      date: order.paidAt,
    },
    { key: 'printing', label: printingLabel, state: state(2), date: order.printedAt },
    { key: 'courier', label: c.stageCourier, state: state(3), date: order.shippedAt },
    { key: 'delivered', label: c.stageDelivered, state: state(4), date: order.deliveredAt },
  ];

  if (order.status === 'returned' || order.status === 'rejected') {
    /*
     * The stages it got through, then ONE stop in place of everything after —
     * a rejected order with three muted steps still drawn after the «اترفض»
     * reads as an order that might yet carry on. The stop sits where the
     * journey ended, so a return reads «… استلمته شركة الشحن ← رجع» and a
     * rejected transfer reads «اتطلب ← اترفض».
     */
    const behind = happy.slice(0, reached + 1).map((stage) => ({ ...stage, state: 'done' as const }));
    const stop: BookOrderStage =
      order.status === 'returned'
        ? { key: 'returned', label: c.stageReturned, state: 'stopped', date: order.returnedAt }
        : { key: 'rejected', label: c.stageRejected, state: 'stopped', date: order.rejectedAt };
    return [...behind, stop];
  }

  return happy;
}

function reachedIndex(
  order: Pick<BookOrder, 'status' | 'paidAt' | 'printedAt' | 'shippedAt' | 'deliveredAt'>,
): number {
  switch (order.status) {
    case 'address_only':
      // «مستني التحويل» IS where the order is — the student's move, not ours.
      return 1;
    case 'paid':
      return 1;
    case 'printing':
      return 2;
    case 'shipped':
      return 3;
    case 'delivered':
      return 4;
    /* A return only happens to a parcel the courier had, so it got at least
       as far as «استلمته شركة الشحن» even if `shippedAt` was never stamped. */
    case 'returned':
      return 3;
    /* A rejection is the admin turning the order down, usually over the
       transfer, so it almost always stops right after «اتطلب». Read the
       timestamps rather than assume, for the rare one rejected later. */
    case 'rejected':
      if (order.shippedAt) return 3;
      if (order.printedAt) return 2;
      if (order.paidAt) return 1;
      return 0;
  }
}

/**
 * Which orders earn a place on the student's HOME screen.
 *
 * The home answers «فين كتابي» — a question about a book still on its way.
 * `/store/orders` keeps every order forever; the home keeps only the ones a
 * student would open the app to check on:
 *
 * - **paid / printing / shipped / returned** — always. The book is owed and
 *   moving (or about to move again, for a return). This is the box's job.
 * - **address_only** — for 30 days from the day the order was started. It is
 *   the one order whose next move is the student's («إكمال الدفع»), so it
 *   belongs up top; but an address form saved and abandoned last term is not
 *   an order anyone is waiting on, and a box nagging about it forever turns
 *   the home into a reminder of a purchase they decided against. The dev
 *   cohort's one unpaid order is exactly that shape: started, never resumed.
 * - **delivered** — for 14 days after `deliveredAt`. Long enough to see «وصل»
 *   land after pressing «استلمت الكتاب» and to reach «كلّم الدعم» if the copy
 *   arrived damaged; after that it is a receipt, and receipts live on
 *   `/store/orders`.
 * - **rejected** — for 7 days after `rejectedAt`. The student has to SEE the
 *   reason (the admin's own words are on the card), but a refusal is not
 *   something to keep pinned above their lessons; the notification and the
 *   history page carry it after that.
 *
 * `now` is a parameter so the rule is testable and so the page decides what
 * "now" is once per render.
 */
export const HOME_UNPAID_DAYS = 30;
export const HOME_DELIVERED_DAYS = 14;
export const HOME_REJECTED_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isBookOrderForHome(
  order: Pick<BookOrder, 'status' | 'paidAt' | 'createdAt' | 'deliveredAt' | 'rejectedAt'>,
  now: number,
): boolean {
  const within = (iso: string | null, days: number) =>
    iso !== null && now - Date.parse(iso) <= days * DAY_MS;

  switch (order.status) {
    case 'paid':
    case 'printing':
    case 'shipped':
    case 'returned':
      return true;
    case 'address_only':
      return within(bookOrderDate(order), HOME_UNPAID_DAYS);
    case 'delivered':
      return within(order.deliveredAt, HOME_DELIVERED_DAYS);
    case 'rejected':
      return within(order.rejectedAt, HOME_REJECTED_DAYS);
  }
}

export function bookOrdersForHome<T extends Parameters<typeof isBookOrderForHome>[0]>(
  orders: readonly T[],
  now: number,
): T[] {
  return orders.filter((order) => isBookOrderForHome(order, now));
}

/**
 * `bookId → coverKey`, read off the shop catalogue the page already fetched.
 *
 * Order lines freeze the title and the price at checkout and carry no cover —
 * a cover is artwork that can be re-uploaded, so the LIVE book's picture is
 * the right one to show and it has to come from the catalogue. Every shelf
 * and every term is walked: a full-year book sits on `full`, not `first`.
 *
 * A book that is no longer in the catalogue (unpublished, deleted) simply has
 * no entry, and `coverForLine` returns `null` for it — the card then draws its
 * placeholder rather than a broken image.
 */
export type BookCoverIndex = ReadonlyMap<string, string>;

export function bookCoverIndex(catalog: Pick<BookCatalog, 'shelves'>): BookCoverIndex {
  const index = new Map<string, string>();
  for (const shelf of catalog.shelves) {
    for (const book of [...shelf.first, ...shelf.second, ...shelf.full]) {
      if (book.coverKey) index.set(book.id, book.coverKey);
    }
  }
  return index;
}

export function coverForLine(line: { bookId: string | null }, covers: BookCoverIndex): string | null {
  return line.bookId ? (covers.get(line.bookId) ?? null) : null;
}
