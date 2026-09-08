import type { Prisma } from '../../generated/prisma/client';

/**
 * «الطلبات اللي فلوسها دخلت» — ONE definition, for every surface that adds up
 * book money.
 *
 * ## Why this is a constant and not a where clause written twice
 *
 * It was written twice. `/admin/books`' own tile counted `('paid','shipped',
 * 'delivered')` with `deletedAt: null`; `/admin/finance`'s overview counted
 * `('paid','shipped')` with no `deletedAt` clause at all. Both tiles render the
 * identical Arabic label «إجمالي إيرادات الكتب», on two tabs of the same
 * screen, and they showed different EGP — diverging by every delivered order
 * and every soft-deleted one, in opposite directions, so the gap did not even
 * look like a rounding difference.
 *
 * The two ways it went wrong are worth stating separately, because they are
 * different mistakes:
 *
 *   * **`delivered` is not a different kind of sale.** It is `shipped` one step
 *     later. Leaving it out meant the owner's revenue FELL every time he
 *     confirmed an arrival — the more carefully he did the paperwork, the less
 *     money the platform reported.
 *
 *   * **`deletedAt` is the filter that is easy to forget and matters most.**
 *     Deletion is soft precisely because «واحد دفع فلوس»: the row survives, so
 *     a read that omits this keeps a hidden order in a total that nothing on
 *     screen can be traced back to.
 *
 * `rejected` and `address_only` are excluded and always were: the whole meaning
 * of turning an order down is that it is not owed and not paid, and an order
 * that never reached the payment step has no money behind it.
 */
/**
 * Orders that REALLY HAPPENED — the population every book figure is drawn from.
 *
 * Used for COST of sales, and for counting parcels. A comped order belongs
 * here: the copies were printed and the parcel was sent whether or not anybody
 * paid for them.
 */
export const BOOK_COUNTED_WHERE = {
  status: { in: ['paid', 'shipped', 'delivered'] },
  deletedAt: null,
} as const satisfies Prisma.BookOrderWhereInput;

/**
 * Orders that brought MONEY IN. The population above, minus the giveaways.
 *
 * ## Why this is a second constant and not one with a flag bolted on
 *
 * There was one predicate feeding both revenue and cost of sales, and adding
 * `isFree` to it would have been the obvious edit and the wrong one: it would
 * have dropped a comped order's COST as well as its income, making a giveaway
 * look free to the business. It is not free to the business. He paid the
 * printer and he paid the courier — «أنا لما أعمله مجاني يبقى أنا دفعت حق
 * الشحن والتصوير» — and the whole reason to record a giveaway at all is that
 * it shows up as the real negative it is.
 *
 * So: cost counts everything that shipped, revenue counts what was paid for,
 * and «مكسب الكتب» goes down by exactly the cost of every book given away.
 */
export const BOOK_REVENUE_WHERE = {
  ...BOOK_COUNTED_WHERE,
  isFree: false,
} as const satisfies Prisma.BookOrderWhereInput;

/* The same two predicates as raw SQL, for the month-by-month query that cannot
   use a Prisma `where`. Kept beside their twins so the pairs are edited
   together — each is one rule, and a change to one half that misses the other
   reopens exactly the divergence this file exists to close. `o` is the
   `book_orders` alias. */
export const BOOK_COUNTED_SQL = `o."status" IN ('paid', 'shipped', 'delivered') AND o."deleted_at" IS NULL`;
export const BOOK_REVENUE_SQL = `${BOOK_COUNTED_SQL} AND o."is_free" = false`;
