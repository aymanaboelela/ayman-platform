import { cacheLife, cacheTag } from 'next/cache';
import {
  BookCatalogSchema,
  DEFAULT_BOOK_SHIPPING_RATES,
  minBookShippingCents,
  type BookCatalog,
  type BookShippingRates,
} from '@ayman/contracts/books';
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
 * Just the delivery RATES, for the three surfaces that show a course's own book
 * («اطلب الكتاب» on the course page, the dashboard card, the player outline).
 *
 * ⚠️ Three numbers and not one since delivery became zoned. It used to return
 * `catalog.shippingCents`, which now means «the cheapest zone» — a floor to
 * quote, never a fee to charge — and handing that to a checkout would under-bill
 * every address outside القاهرة والجيزة.
 *
 * Reads the whole catalogue and throws the shelves away, which sounds wasteful
 * and is not: `getBookCatalogOrEmpty` is `'use cache'` on one coarse tag, so
 * every caller in a render — and every page across the cache window — shares one
 * fetch. The alternative was a second endpoint returning one integer, or putting
 * the fee on `PublicSettingsSchema` where every page on the site would parse a
 * number three of them use. Both cost more than this does.
 */
export async function getBookShippingRates(): Promise<BookShippingRates> {
  const catalog = await getBookCatalogOrEmpty();
  return catalog.shippingRates;
}

export async function getBookCatalogOrEmpty(): Promise<BookCatalog> {
  'use cache';
  cacheLife('minutes');
  cacheTag(TAG_BOOKS);

  try {
    return await apiGet('/api/books', BookCatalogSchema);
  } catch {
    /* The shelves are empty, so nothing on this payload is ever CHARGED — but
       the rates still have to parse and still have to be the real ones, because
       a cart restored from `localStorage` renders its total against them. See
       `DEFAULT_BOOK_SHIPPING_RATES`: the quoted numbers, written once. */
    return {
      shelves: [],
      shippingCents: minBookShippingCents(DEFAULT_BOOK_SHIPPING_RATES),
      shippingRates: DEFAULT_BOOK_SHIPPING_RATES,
      total: 0,
    };
  }
}
