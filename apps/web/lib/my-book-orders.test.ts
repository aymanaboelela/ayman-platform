import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookOrder } from '@ayman/contracts/book-orders';

/*
 * `./api-server` imports `next/headers`, which cannot be loaded outside a
 * request — so it is mocked with a FACTORY, which stops the real module (and
 * therefore `next/headers`) from being evaluated at all. Hoisted by Vitest
 * above the import below, which is why `apiGetAuthed` is reached through the
 * mocked module rather than captured here.
 */
vi.mock('./api-server', () => ({ apiGetAuthed: vi.fn() }));

import { apiGetAuthed } from './api-server';
import { fetchMyBookOrders, newestFirst } from './my-book-orders';

const mocked = vi.mocked(apiGetAuthed);

const order = (id: string, createdAt: string): BookOrder =>
  ({
    id,
    courseId: null,
    courseTitle: null,
    bookTitle: 'كتاب البرمجة',
    items: [],
    amountCents: 31500,
    itemsCents: 25000,
    shippingCents: 6500,
    discountCents: 0,
    status: 'paid',
    fullName: 'طالب',
    phone: '+201021196367',
    altPhone: '+201021196368',
    governorateCode: 'CA',
    city: 'القاهرة',
    addressStreet: 'شارع',
    addressBuilding: null,
    addressNote: null,
    senderPhone: null,
    paidAt: null,
    shippedAt: null,
    deliveredAt: null,
    rejectedAt: null,
    rejectionReason: null,
    createdAt,
  }) satisfies BookOrder;

beforeEach(() => {
  mocked.mockReset();
});

/**
 * ⚠️ THE test on this module.
 *
 * The dashboard has been taken down before by an added read that threw — a call
 * on the busiest authenticated path, answered 429 by the throttler, thrown
 * through the API helper into «This page couldn't load». This read is the tenth
 * parallel call on that page. The contract that makes it safe to add is that it
 * cannot throw, and that the section renders nothing for what it returns
 * instead.
 */
describe('fetchMyBookOrders', () => {
  it('returns the orders when the API answers', async () => {
    const rows = [order('a', '2026-03-01T10:00:00.000Z')];
    mocked.mockResolvedValueOnce(rows);

    await expect(fetchMyBookOrders()).resolves.toEqual(rows);
  });

  it('returns an empty list rather than throwing when the read fails', async () => {
    // A 429 from the `short` throttle, a restarted API mid-deploy, a payload
    // that no longer parses — every one of them must degrade to the dashboard
    // the student saw yesterday, never to an error page about a book.
    mocked.mockRejectedValueOnce(new Error('429'));

    await expect(fetchMyBookOrders()).resolves.toEqual([]);
  });

  it('swallows a rejection of any shape, not just an Error', async () => {
    // `apiGetAuthed` throws `ApiRequestError`, but a Zod parse failure and an
    // aborted fetch are neither, and a bare `catch` is what covers all three.
    mocked.mockRejectedValueOnce('boom');

    await expect(fetchMyBookOrders()).resolves.toEqual([]);
  });
});

describe('newestFirst', () => {
  it('puts the most recent order first and the oldest last', () => {
    const rows = [
      order('old', '2026-01-05T09:00:00.000Z'),
      order('new', '2026-03-01T10:00:00.000Z'),
      order('mid', '2026-02-02T08:00:00.000Z'),
    ];

    expect(newestFirst(rows).map((row) => row.id)).toEqual(['new', 'mid', 'old']);
  });

  it('does not reorder the array it was given', () => {
    // The list is shared across one render through `cache()`, so a sort in
    // place would reorder it under the other caller — the dashboard card and
    // the history page read the very same array.
    const rows = [order('old', '2026-01-05T09:00:00.000Z'), order('new', '2026-03-01T10:00:00.000Z')];

    newestFirst(rows);

    expect(rows.map((row) => row.id)).toEqual(['old', 'new']);
  });
});
