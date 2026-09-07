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
export const BOOK_REVENUE_WHERE = {
  status: { in: ['paid', 'shipped', 'delivered'] },
  deletedAt: null,
} as const satisfies Prisma.BookOrderWhereInput;

/** The same predicate as raw SQL, for the month-by-month query that cannot use
 *  a Prisma `where`. Kept beside its twin so the two are edited together —
 *  they are one rule, and a change to one that misses the other reopens exactly
 *  the divergence this file exists to close. `o` is the `book_orders` alias. */
export const BOOK_REVENUE_SQL = `o."status" IN ('paid', 'shipped', 'delivered') AND o."deleted_at" IS NULL`;
