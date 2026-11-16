import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import type { BookOrder } from '@ayman/contracts/book-orders';
import type { BookCard } from '@ayman/contracts/books';
import {
  bookCoverIndex,
  bookOrderStages,
  bookOrdersForHome,
  coverForLine,
  isBookOrderForHome,
} from './book-order-track';

const c = copy.books.mine;

const CREATED = '2026-09-15T10:00:00.000Z';
const PAID = '2026-10-05T10:00:00.000Z';
const PRINTED = '2026-10-07T10:00:00.000Z';
const SHIPPED = '2026-10-09T10:00:00.000Z';
const DELIVERED = '2026-10-11T10:00:00.000Z';

type Track = Parameters<typeof bookOrderStages>[0];

function track(overrides: Partial<Track>): Track {
  return {
    status: 'paid',
    paidAt: null,
    printedAt: null,
    shippedAt: null,
    deliveredAt: null,
    returnedAt: null,
    rejectedAt: null,
    createdAt: CREATED,
    ...overrides,
  };
}

/** `key:state` per stage — the shape worth pinning, read at a glance. */
const shape = (order: Track) => bookOrderStages(order).map((s) => `${s.key}:${s.state}`);
const byKey = (order: Track) => Object.fromEntries(bookOrderStages(order).map((s) => [s.key, s]));

/**
 * The tracker's one promise: the highlighted stage is where the order IS, never
 * where it is going. A paid order lit up at «بيتطبع» would be telling a
 * worried student the copy is at the printer when it is not.
 */
describe('bookOrderStages — the happy path', () => {
  it('address_only: ordered, and waiting on the transfer — the student’s move', () => {
    const order = track({ status: 'address_only' });
    expect(shape(order)).toEqual([
      'ordered:done',
      'payment:current',
      'printing:upcoming',
      'courier:upcoming',
      'delivered:upcoming',
    ]);
    const stages = byKey(order);
    expect(stages.payment?.label).toBe(c.stageAwaitingTransfer);
    // Unpaid: the one case where «اتطلب» carries a date, through bookOrderDate.
    expect(stages.ordered?.date).toBe(CREATED);
    expect(stages.payment?.date).toBeNull();
  });

  it('paid: «اتدفع» is current with its date; printing is only next', () => {
    const order = track({ status: 'paid', paidAt: PAID });
    expect(shape(order)).toEqual([
      'ordered:done',
      'payment:current',
      'printing:upcoming',
      'courier:upcoming',
      'delivered:upcoming',
    ]);
    const stages = byKey(order);
    expect(stages.payment?.label).toBe(c.stagePaid);
    expect(stages.payment?.date).toBe(PAID);
    expect(stages.printing?.label).toBe(c.stagePrinting);
  });

  it('never dates «اتطلب» with createdAt once the order is paid', () => {
    // «اي تاريخ مكتوب يبقى تاريخ الدفع» — see book-order-date.test.ts.
    expect(byKey(track({ status: 'paid', paidAt: PAID })).ordered?.date).toBeNull();
  });

  it('printing: «بيتطبع» is current, dated from the print run', () => {
    const order = track({ status: 'printing', paidAt: PAID, printedAt: PRINTED });
    expect(shape(order)).toEqual([
      'ordered:done',
      'payment:done',
      'printing:current',
      'courier:upcoming',
      'delivered:upcoming',
    ]);
    expect(byKey(order).printing).toMatchObject({ label: c.stagePrinting, date: PRINTED });
  });

  it('shipped: «استلمته شركة الشحن» is current with shippedAt; printing reads «اتطبع»', () => {
    const order = track({ status: 'shipped', paidAt: PAID, printedAt: PRINTED, shippedAt: SHIPPED });
    expect(shape(order)).toEqual([
      'ordered:done',
      'payment:done',
      'printing:done',
      'courier:current',
      'delivered:upcoming',
    ]);
    const stages = byKey(order);
    expect(stages.courier).toMatchObject({ label: c.stageCourier, date: SHIPPED });
    expect(stages.printing).toMatchObject({ label: c.stagePrinted, date: PRINTED });
  });

  it('a parcel that skipped the printer reads «اتجهز», undated — not «اتطبع»', () => {
    const order = track({ status: 'shipped', paidAt: PAID, shippedAt: SHIPPED });
    expect(byKey(order).printing).toMatchObject({ state: 'done', label: c.stagePrepared, date: null });
  });

  it('delivered: every stage behind it and «وصل» dated', () => {
    const order = track({
      status: 'delivered',
      paidAt: PAID,
      printedAt: PRINTED,
      shippedAt: SHIPPED,
      deliveredAt: DELIVERED,
    });
    expect(shape(order)).toEqual([
      'ordered:done',
      'payment:done',
      'printing:done',
      'courier:done',
      'delivered:current',
    ]);
    expect(byKey(order).delivered).toMatchObject({ label: c.stageDelivered, date: DELIVERED });
  });

  it('delivered straight from paid still shows the steps it went past, without dates', () => {
    const order = track({ status: 'delivered', paidAt: PAID, deliveredAt: DELIVERED });
    const stages = byKey(order);
    expect(stages.courier).toMatchObject({ state: 'done', date: null });
    expect(stages.printing).toMatchObject({ state: 'done', label: c.stagePrepared });
  });
});

describe('bookOrderStages — the two end states', () => {
  it('returned: the journey up to the courier, then ONE stop and nothing muted after it', () => {
    const order = track({
      status: 'returned',
      paidAt: PAID,
      printedAt: PRINTED,
      shippedAt: SHIPPED,
      returnedAt: '2026-10-12T10:00:00.000Z',
    });
    expect(shape(order)).toEqual([
      'ordered:done',
      'payment:done',
      'printing:done',
      'courier:done',
      'returned:stopped',
    ]);
    expect(byKey(order).returned).toMatchObject({
      label: c.stageReturned,
      date: '2026-10-12T10:00:00.000Z',
    });
  });

  it('rejected before payment: «اتطلب» then «اترفض» — no future stages drawn', () => {
    const order = track({ status: 'rejected', rejectedAt: '2026-09-16T10:00:00.000Z' });
    expect(shape(order)).toEqual(['ordered:done', 'rejected:stopped']);
    expect(byKey(order).rejected).toMatchObject({
      label: c.stageRejected,
      date: '2026-09-16T10:00:00.000Z',
    });
  });

  it('rejected after payment keeps «اتدفع» behind it', () => {
    const order = track({ status: 'rejected', paidAt: PAID, rejectedAt: '2026-10-06T10:00:00.000Z' });
    expect(shape(order)).toEqual(['ordered:done', 'payment:done', 'rejected:stopped']);
    expect(byKey(order).payment?.label).toBe(c.stagePaid);
  });

  it('no end state ever has a current stage in it', () => {
    for (const status of ['returned', 'rejected'] as const) {
      const stages = bookOrderStages(track({ status, paidAt: PAID, shippedAt: SHIPPED }));
      expect(stages.some((s) => s.state === 'current' || s.state === 'upcoming')).toBe(false);
      expect(stages.at(-1)?.state).toBe('stopped');
    }
  });
});

describe('bookOrdersForHome — which orders earn the home screen', () => {
  const NOW = Date.parse('2026-11-16T12:00:00.000Z');
  const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
  const home = (overrides: Partial<BookOrder>) =>
    isBookOrderForHome(
      {
        status: 'paid',
        paidAt: null,
        createdAt: daysAgo(1),
        deliveredAt: null,
        rejectedAt: null,
        ...overrides,
      },
      NOW,
    );

  it('keeps every order still on its way, however old', () => {
    for (const status of ['paid', 'printing', 'shipped', 'returned'] as const) {
      expect(home({ status, paidAt: daysAgo(90), createdAt: daysAgo(90) }), status).toBe(true);
    }
  });

  it('keeps an unpaid order for 30 days, then leaves it to the history page', () => {
    expect(home({ status: 'address_only', createdAt: daysAgo(29) })).toBe(true);
    expect(home({ status: 'address_only', createdAt: daysAgo(31) })).toBe(false);
  });

  it('keeps a delivered order for 14 days after it arrived', () => {
    expect(home({ status: 'delivered', deliveredAt: daysAgo(13) })).toBe(true);
    expect(home({ status: 'delivered', deliveredAt: daysAgo(15) })).toBe(false);
    expect(home({ status: 'delivered', deliveredAt: null })).toBe(false);
  });

  it('keeps a rejected order for a week so the reason is seen, not longer', () => {
    expect(home({ status: 'rejected', rejectedAt: daysAgo(6) })).toBe(true);
    expect(home({ status: 'rejected', rejectedAt: daysAgo(8) })).toBe(false);
  });

  it('filters a list and keeps the order objects untouched', () => {
    const open = { status: 'shipped' as const, paidAt: daysAgo(3), createdAt: daysAgo(3), deliveredAt: null, rejectedAt: null };
    const old = { status: 'delivered' as const, paidAt: daysAgo(60), createdAt: daysAgo(60), deliveredAt: daysAgo(50), rejectedAt: null };
    expect(bookOrdersForHome([old, open], NOW)).toEqual([open]);
    expect(bookOrdersForHome([old], NOW)).toEqual([]);
  });
});

describe('bookCoverIndex / coverForLine', () => {
  const book = (id: string, coverKey: string | null): BookCard => ({
    id,
    slug: id,
    titleAr: id,
    subtitleAr: null,
    coverKey,
    descriptionAr: null,
    priceCents: 25000,
    comparePriceCents: null,
    pageCount: null,
    term: 'first',
    year: null,
    inStock: true,
    forGeneral: true,
    forLanguages: false,
    showOnLanding: false,
  });

  const covers = bookCoverIndex({
    shelves: [
      {
        subjectId: null,
        subjectNameAr: 'برمجة',
        subjectSlug: null,
        first: [book('b-first', 'books/first.jpg')],
        second: [book('b-bare', null)],
        full: [book('b-full', 'books/full.jpg')],
      },
    ],
  });

  it('maps a line to its live book’s cover, from every term’s shelf', () => {
    expect(coverForLine({ bookId: 'b-first' }, covers)).toBe('books/first.jpg');
    expect(coverForLine({ bookId: 'b-full' }, covers)).toBe('books/full.jpg');
  });

  it('gives null — the placeholder — for a book with no cover, one gone from the shop, or a hand-typed line', () => {
    expect(coverForLine({ bookId: 'b-bare' }, covers)).toBeNull();
    expect(coverForLine({ bookId: 'b-deleted' }, covers)).toBeNull();
    expect(coverForLine({ bookId: null }, covers)).toBeNull();
  });
});
