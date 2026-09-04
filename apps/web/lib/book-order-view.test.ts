import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import {
  BookOrderStatusSchema,
  type BookOrderStatus,
} from '@ayman/contracts/book-orders';
import { describeBookOrderStatus, MY_BOOK_ORDERS_HREF } from './book-order-view';

const c = copy.books.mine;

/**
 * The status→copy mapping, pinned per status.
 *
 * This is the one part of «كتبي» worth a test, and it is not a rendering
 * concern: `noteShipped` on a `rejected` order — «الكتاب خرج ليك وفي الطريق» on
 * an order that was turned down — is not a layout bug, it is the platform
 * lying to somebody who is already worried. The whole feature exists because
 * the student had no way to find out anything except by phoning, so the thing
 * that has to be right is WHAT IT SAYS.
 *
 * Asserted against `copy.books.mine.*` rather than against literal Arabic:
 * these strings are edited, and a test that re-types them would fail on every
 * wording pass while proving nothing about the mapping.
 */
describe('describeBookOrderStatus', () => {
  it('pairs each of the five statuses with its own chip and its own note', () => {
    const cases: Record<BookOrderStatus, { label: string; note: string }> = {
      address_only: { label: c.statusAddressOnly, note: c.noteAddressOnly },
      paid: { label: c.statusPaid, note: c.notePaid },
      shipped: { label: c.statusShipped, note: c.noteShipped },
      delivered: { label: c.statusDelivered, note: c.noteDelivered },
      rejected: { label: c.statusRejected, note: c.noteRejected },
    };

    for (const [status, expected] of Object.entries(cases) as [
      BookOrderStatus,
      { label: string; note: string },
    ][]) {
      const view = describeBookOrderStatus(status);
      expect(view.label, status).toBe(expected.label);
      expect(view.note, status).toBe(expected.note);
    }
  });

  it('covers every member of the contract, so a sixth status cannot ship unmapped', () => {
    /*
     * The enum grew from three members to five in the commit that added
     * `deliveredAt`/`rejectedAt`, and the `switch` in `book-order-view.ts` is
     * what made that a compile error rather than two silently missing chips.
     * This is the runtime half of the same guard: it walks the SCHEMA, so a
     * member added later fails here even if a future refactor replaces the
     * exhaustive switch with a lookup table that type-checks.
     */
    for (const status of BookOrderStatusSchema.options) {
      const view = describeBookOrderStatus(status);
      expect(view.label, status).toBeTruthy();
      expect(view.note, status).toBeTruthy();
      expect(view.tone, status).toMatch(/^var\(--/);
    }
  });

  it('offers support only on an order that has finished moving', () => {
    // «كلّم الدعم» is shown on `closed` orders alone. On one still in transit
    // the card's own note already says what happens next, and a support link
    // there invites exactly the phone call this section exists to prevent.
    expect(describeBookOrderStatus('delivered').closed).toBe(true);
    expect(describeBookOrderStatus('rejected').closed).toBe(true);
    expect(describeBookOrderStatus('address_only').closed).toBe(false);
    expect(describeBookOrderStatus('paid').closed).toBe(false);
    expect(describeBookOrderStatus('shipped').closed).toBe(false);
  });

  it('never paints a passive status in the action colour', () => {
    // Amber is what you press, everywhere in this product. A status chip
    // wearing `--a-*` reads as a button that does nothing — see `<StreamBadge>`
    // for the same decision on the same grounds.
    for (const status of BookOrderStatusSchema.options) {
      expect(describeBookOrderStatus(status).tone, status).not.toMatch(/--a-/);
    }
  });
});

describe('MY_BOOK_ORDERS_HREF', () => {
  it('is a segment under the shop, never the shop itself', () => {
    /*
     * `app/(site)/books/page.tsx` owns `/books`. Two route groups may not
     * resolve to one URL, and a notification saying «كتابك خرج ليك» that lands
     * on a page selling books has answered a worried student with an
     * advertisement.
     */
    expect(MY_BOOK_ORDERS_HREF).toBe('/books/mine');
    expect(MY_BOOK_ORDERS_HREF).not.toBe('/books');
  });
});
