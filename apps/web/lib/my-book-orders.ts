import { cache } from 'react';
import { z } from '@ayman/contracts/zod';
import { BookOrderSchema, type BookOrder } from '@ayman/contracts/book-orders';
import { apiGetAuthed } from './api-server';

/**
 * `GET /api/book-orders/mine` — every printed book this student ever ordered.
 *
 * The endpoint has existed and been permissioned since the shop shipped, and
 * until this pass nothing in the product rendered it: a student who ordered a
 * book got a confirmation screen and then silence, and the only way to learn
 * anything after that was to phone and ask. Which is what they did.
 *
 * ## Why `cache()` and NOT `'use cache'`
 *
 * Identical to `lib/mastery.ts`, and worth restating because the two files this
 * one sits between (`lib/books.ts` is `'use cache'`) look alike and must not
 * behave alike. `getBookCatalogOrEmpty` caches the SHOP — unauthenticated,
 * identical for every visitor, so one shared entry leaks nothing. This is one
 * student's own orders, with their name, their phone and their home address on
 * every row, and the function takes NO ARGUMENTS — a `'use cache'` entry would
 * have nothing to key on and would hand the first student's delivery address to
 * everybody who loaded the dashboard after them.
 *
 * `cache()` is per-request, and `apiGetAuthed` leaves its `fetch` on
 * `no-store`, which is what `lib/dashboard.ts` already relies on for the same
 * reason.
 *
 * ## Why it returns `[]` instead of throwing
 *
 * ⚠️ The dashboard has been taken down before by exactly this: a read added to
 * the busiest authenticated path, answered 429 by the throttler, thrown through
 * the API helper into «This page couldn't load» — see the note on
 * `getTaxonomyOrNull()`'s call site in `dashboard/page.tsx`, and `getMasteryOrNull`
 * for the second time it nearly happened. This read makes that page's TENTH
 * parallel call against a `short` limit of 10 per second.
 *
 * An empty array is the same value a student who has never ordered a book
 * produces, and `<MyBookOrdersSection>` renders NOTHING for it — so the failure
 * mode is «the page looks exactly as it did last week», not a broken card and
 * certainly not a broken page. The section is an addition to a screen that was
 * complete without it.
 *
 * ⚠️ This is also why the section must never be the place a student finds out
 * an order EXISTS at all: `[]` is indistinguishable from "the API is down", so
 * `/store/orders` (which is the whole page, not a card on someone else's) reads
 * through `fetchMyBookOrders` too and shows its own empty state. Both are
 * honest; neither is an error message a student can do anything with.
 *
 * The `try` is inside rather than at the call site so no future caller can
 * forget it — same placement, and the same argument, as `getMasteryOrNull`.
 *
 * Server Components / Server Actions only: `apiGetAuthed` reads `cookies()`.
 */
const MyBookOrdersSchema = z.array(BookOrderSchema);

/**
 * The uncached body, exported so a test can drive it without standing up
 * React's per-request cache — `cache()` is a memo, not behaviour, and the
 * behaviour worth pinning is that a rejected fetch comes back as `[]`.
 */
export async function fetchMyBookOrders(): Promise<BookOrder[]> {
  try {
    return await apiGetAuthed('/api/book-orders/mine', MyBookOrdersSchema);
  } catch {
    return [];
  }
}

export const getMyBookOrdersOrEmpty = cache(fetchMyBookOrders);

/**
 * Newest first — «oldest-last», which is the order both surfaces show.
 *
 * Sorted HERE rather than trusted from the API: the endpoint's ordering is not
 * part of `z.array(BookOrderSchema)`, so a change to it would silently reverse
 * the dashboard card without failing anything. A student's most recent order is
 * the one they opened the page to check on.
 *
 * A copy, never a sort in place: the array is shared across one render through
 * `cache()`, and mutating it would reorder it under the other caller.
 */
export function newestFirst(orders: readonly BookOrder[]): BookOrder[] {
  return [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
