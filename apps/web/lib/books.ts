import { cacheLife, cacheTag } from 'next/cache';
import { BookCatalogSchema, BOOK_SHIPPING_CENTS, type BookCatalog } from '@ayman/contracts/books';
import { apiGet } from '@/lib/api';
import { TAG_BOOKS } from '@/lib/cache-tags';

/**
 * «قسم الكتب» — the shop, for the page that renders it.
 *
 * ⚠️ With `cacheComponents: true`, `fetch` is NOT cached by default and blocks
 * rendering. Every call into Nest from a Server Component is live unless it is
 * inside a `'use cache'` function — which is what this is for.
 *
 * ## Why the failure is caught INSIDE the cached body
 *
 * `/books` is prerendered, and `next build` runs inside `docker build` where no
 * API is listening. An error thrown while a cached function executes surfaces to
 * the caller as an opaque digest from the `Cache` environment, which React
 * re-throws during render — a `try/catch` at the call site never sees it and the
 * whole route 500s. Catching here is what actually contains it. Same trade
 * `getCatalogOrEmpty` documents.
 *
 * `cacheLife('minutes')` and not `'hours'`, for the same reason it uses:
 * this function caches its own failures, and a transient API restart during a
 * deploy must not leave the shop showing «مفيش كتب» for the rest of the
 * afternoon.
 *
 * The empty fallback still carries a real `shippingCents`, because the number is
 * shown next to a price and a `0` there would be a quoted delivery fee that is
 * not the one anybody will be charged.
 */
/**
 * Just the delivery fee, for the three surfaces that show a course's own book
 * («اطلب الكتاب» on the course page, the dashboard card, the player outline).
 *
 * Reads the whole catalogue and throws the shelves away, which sounds wasteful
 * and is not: `getBookCatalogOrEmpty` is `'use cache'` on one coarse tag, so
 * every caller in a render — and every page across the cache window — shares one
 * fetch. The alternative was a second endpoint returning one integer, or putting
 * the fee on `PublicSettingsSchema` where every page on the site would parse a
 * number three of them use. Both cost more than this does.
 */
export async function getBookShippingCents(): Promise<number> {
  const catalog = await getBookCatalogOrEmpty();
  return catalog.shippingCents;
}

export async function getBookCatalogOrEmpty(): Promise<BookCatalog> {
  'use cache';
  cacheLife('minutes');
  cacheTag(TAG_BOOKS);

  try {
    return await apiGet('/api/books', BookCatalogSchema);
  } catch {
    return { shelves: [], shippingCents: BOOK_SHIPPING_CENTS, total: 0 };
  }
}
