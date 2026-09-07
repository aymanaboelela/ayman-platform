import { Injectable } from '@nestjs/common';
import type {
  AdminFinanceOverview,
  ExpenseCategory,
  FinanceMonth,
} from '@ayman/contracts/admin/expenses';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { BOOK_REVENUE_SQL, BOOK_REVENUE_WHERE } from '../book-orders/book-revenue';

/** The shared predicate as a raw SQL fragment. `Prisma.raw` is safe here and
 *  only here: `BOOK_REVENUE_SQL` is a module-level constant with no interpolation
 *  and nothing from a request ever reaches it. Going through the constant — 
 *  rather than retyping the statuses in each query — is what stops the raw
 *  month-by-month SQL from drifting away from the Prisma `where` again. */
const BOOK_REVENUE_RAW = Prisma.raw(BOOK_REVENUE_SQL);

/** How many months of trend the screen gets. Eighteen covers "this year and
 *  last autumn", which is the longest comparison anybody makes here, and keeps
 *  the payload a fixed small size no matter how old the platform gets. */
const MONTHS = 18;

interface MonthlyRow {
  month: string;
  subscription: bigint | number | null;
  books: bigint | number | null;
  expenses: bigint | number | null;
  subscriptionRefunds: bigint | number | null;
  bookRefunds: bigint | number | null;
}

interface CostRow {
  cost: bigint | number | null;
  unknown: bigint | number | null;
  items: bigint | number | null;
  shipping: bigint | number | null;
}

/** Postgres `SUM`/`COUNT` come back as `bigint` through the driver. Every
 *  figure here is piastres and fits in a double many times over, so the
 *  narrowing is safe — but it has to be explicit or the JSON serialiser throws
 *  on a `bigint` it cannot represent. */
function toNumber(value: bigint | number | null): number {
  return value === null ? 0 : Number(value);
}

/**
 * «النظرة العامة» — what came in, what went out, and what is left.
 *
 * ## Why this is its own service and not more of `FinanceService`
 *
 * That one is about SUBSCRIPTIONS: it lists grants, edits their amounts and
 * cancels them, and its spec pins the Prisma delegates it may touch. This
 * composes three unrelated sources — payment submissions, book orders and
 * expenses — and owns no rows at all. Putting it there would give a service
 * with mutation power over grants a reason to read the whole database.
 *
 * ## Revenue is defined ONCE, here, and matches the tiles
 *
 * Subscriptions: approved, non-comped submissions, all time — the same filter
 * `FinanceService.list`'s own revenue tile uses, including the `isFree: false`
 * that keeps an admin-comped term out of the money. Books: `BOOK_REVENUE_WHERE`
 * below, which is the SAME constant `BookOrdersService.adminRevenueSummary`
 * uses. Two screens computing revenue two ways is how one number ends up with
 * two values — and that is not hypothetical here, it is what this file did.
 *
 * ## What was wrong, so it does not come back
 *
 * This service filtered book orders to `status IN ('paid','shipped')` with no
 * `deletedAt` clause, while `/admin/books` counted `('paid','shipped',
 * 'delivered')` AND `deletedAt: null`. Two tiles carrying the identical Arabic
 * label «إجمالي إيرادات الكتب» therefore showed different EGP, diverging by
 * every delivered order (missing here) and every soft-deleted one (counted
 * here and nowhere else). Marking an order «وصل» — doing the paperwork right —
 * silently deleted its revenue from this screen.
 *
 * Both surfaces now import one exported constant. A future divergence has to
 * be written deliberately rather than arrived at.
 *
 * ## Refunds are subtracted, cancellations are not
 *
 * A refund is a `Refund` row: dated, explained, and landing in ITS OWN month.
 * Revoking access is not a refund — cutting off a student who cheated keeps
 * the money — so nothing here reads `revokedAt`. See `Refund`'s model note.
 */
@Injectable()
export class FinanceOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<AdminFinanceOverview> {
    const [subscriptionRevenue, bookRevenue, expenseGroups, cost, refunds, months] =
      await Promise.all([
        this.prisma.paymentSubmission.aggregate({
          // Identical to the revenue tile's filter — see the class doc.
          where: { status: 'approved', isFree: false },
          _sum: { amountCents: true },
        }),
        this.prisma.bookOrder.aggregate({
          where: BOOK_REVENUE_WHERE,
          _sum: { amountCents: true },
        }),
        this.prisma.expense.groupBy({
          by: ['category'],
          _sum: { amountCents: true },
        }),
        this.bookCostOfSales(),
        this.refundTotals(),
        this.monthly(),
      ]);

    const subscriptionRevenueCents = subscriptionRevenue._sum.amountCents ?? 0;
    const bookRevenueCents = bookRevenue._sum.amountCents ?? 0;
    const revenueTotalCents = subscriptionRevenueCents + bookRevenueCents;

    const { subscriptionRefundsCents, bookRefundsCents } = refunds;
    const refundsTotalCents = subscriptionRefundsCents + bookRefundsCents;

    const subscriptionNetRevenueCents = subscriptionRevenueCents - subscriptionRefundsCents;
    const bookNetRevenueCents = bookRevenueCents - bookRefundsCents;
    const netRevenueTotalCents = revenueTotalCents - refundsTotalCents;

    // «مكسب الكتب» is built from the ITEMS, never from the order total — see
    // the contract's own note. The order total carries the shipping fee, which
    // is collected from the student and handed to the courier unchanged;
    // counting it as margin reported the courier's money as the owner's, at the
    // full fee on every single order.
    //
    // The refund comes off here too. A refunded order is one whose money went
    // back, and the copies it cost to print are still gone — so the profit on
    // it is genuinely negative, and saying so is the point of the figure.
    const bookItemsNetCents = cost.bookItemsCents - bookRefundsCents;
    const bookProfitCents = bookItemsNetCents - cost.bookCostOfSalesCents;

    const expensesByCategory = expenseGroups
      .map((group) => ({
        category: group.category as ExpenseCategory,
        amountCents: group._sum.amountCents ?? 0,
      }))
      // Empty buckets are dropped rather than sent as zeroes: a legend with
      // four «٠ ج» rows in it is one nobody reads to the bottom.
      .filter((entry) => entry.amountCents > 0)
      .sort((a, b) => b.amountCents - a.amountCents);

    const expensesTotalCents = expensesByCategory.reduce((sum, e) => sum + e.amountCents, 0);

    return {
      subscriptionRevenueCents,
      bookRevenueCents,
      revenueTotalCents,
      subscriptionRefundsCents,
      bookRefundsCents,
      refundsTotalCents,
      subscriptionNetRevenueCents,
      bookNetRevenueCents,
      netRevenueTotalCents,
      expensesTotalCents,
      expensesByCategory,
      bookCostOfSalesCents: cost.bookCostOfSalesCents,
      bookCostUnknownCount: cost.bookCostUnknownCount,
      bookProfitCents,
      bookItemsNetCents,
      bookShippingCents: cost.bookShippingCents,
      // Revenue that actually STAYED, minus what went out. The refund is
      // subtracted here and the cost of sales is NOT — `printing` expenses
      // already carry what the paper cost, in the month the printer was paid,
      // and subtracting both would count every print run twice. `bookProfitCents`
      // above is the per-copy view of the same books and is deliberately not
      // an addend of this total.
      netCents: netRevenueTotalCents - expensesTotalCents,
      months,
    };
  }

  /**
   * «الفلوس اللي رجعت» — all time, split by the stream each refund reverses.
   *
   * One `groupBy` and not two aggregates: the two figures are always read
   * together and a row belongs to exactly one stream (`refunds_one_target`),
   * so grouping on the two nullable FKs partitions the table with no overlap
   * and no gap.
   *
   * ⚠️ Nothing here reads `revokedAt`. A cancellation is not a refund: cutting
   * off a student who cheated keeps his money, and only an explicitly recorded
   * `Refund` takes money out of a total. Making the deduction a separate act is
   * what lets the owner do one without the other.
   */
  private async refundTotals(): Promise<{
    subscriptionRefundsCents: number;
    bookRefundsCents: number;
  }> {
    const [subscription, book] = await Promise.all([
      this.prisma.refund.aggregate({
        where: { submissionId: { not: null } },
        _sum: { amountCents: true },
      }),
      this.prisma.refund.aggregate({
        where: { bookOrderId: { not: null } },
        _sum: { amountCents: true },
      }),
    ]);

    return {
      subscriptionRefundsCents: subscription._sum.amountCents ?? 0,
      bookRefundsCents: book._sum.amountCents ?? 0,
    };
  }

  /**
   * What the copies that were actually SOLD cost to make.
   *
   * ⚠️ Deliberately not the `printing` expenses, and both are real numbers. A
   * print run is money that left in the month it was paid; this is the cost
   * attributable to what was sold. Reporting book profit as revenue minus print
   * runs swings wildly with when the printer was invoiced — a month with a run
   * and no sales would show a catastrophic loss on books that are sitting in a
   * box waiting to ship.
   *
   * A line whose book has no `unit_cost_cents` — or no book at all, which is
   * what an admin's hand-typed «كتاب خاص» line is — contributes nothing and is
   * COUNTED, so a margin computed against a partly-unpriced catalogue announces
   * itself instead of quietly overstating profit.
   */
  private async bookCostOfSales(): Promise<{
    bookCostOfSalesCents: number;
    bookCostUnknownCount: number;
    bookItemsCents: number;
    bookShippingCents: number;
  }> {
    /*
     * The cost comes from `i."unit_cost_cents"` — the line's OWN frozen
     * snapshot — and no longer from a join to `books`.
     *
     * That join was live, so two ordinary admin actions rewrote history:
     * deleting a retired title (`book_id` is `ON DELETE SET NULL`) erased the
     * cost of every copy ever sold under it and raised the reported margin
     * across months already closed, and editing what a copy costs restated the
     * profit of every past sale. `unit_price_cents` next to it has always been
     * frozen for exactly this reason; the cost now is too.
     *
     * `items` and `shipping` are summed in the same pass because the profit
     * figure must be built from items alone — the shipping fee is collected
     * from the student and paid straight to the courier, so counting it as book
     * margin credited the owner with the courier's money on every order.
     * Shipping is read off `book_orders` with a DISTINCT-safe subquery rather
     * than summed here: it is per ORDER and this query is per ITEM, so summing
     * it alongside would multiply it by the number of lines in the basket.
     */
    const rows = await this.prisma.$queryRaw<CostRow[]>`
      SELECT
        COALESCE(SUM(i."quantity" * i."unit_cost_cents"), 0)      AS cost,
        COUNT(*) FILTER (WHERE i."unit_cost_cents" IS NULL)       AS unknown,
        COALESCE(SUM(i."quantity" * i."unit_price_cents"), 0)     AS items,
        (
          SELECT COALESCE(SUM(o."shipping_cents"), 0)
          FROM "app"."book_orders" o
          WHERE ${BOOK_REVENUE_RAW}
        )                                                          AS shipping
      FROM "app"."book_order_items" i
      JOIN "app"."book_orders" o ON o."id" = i."order_id"
      WHERE ${BOOK_REVENUE_RAW}
    `;

    const row = rows[0];
    return {
      bookCostOfSalesCents: toNumber(row?.cost ?? 0),
      bookCostUnknownCount: toNumber(row?.unknown ?? 0),
      bookItemsCents: toNumber(row?.items ?? 0),
      bookShippingCents: toNumber(row?.shipping ?? 0),
    };
  }

  /**
   * The trend, one row per calendar month, newest first.
   *
   * ## Why one query and not three
   *
   * The three sources have to be aligned on the same months or the screen has
   * to do a join in JavaScript over three sparse lists — and get the months
   * where one of them is empty right. `generate_series` builds the axis first
   * and the three sums land on it, so a month with expenses and no revenue is a
   * real row with a real negative net rather than a gap.
   *
   * ## Which date each source is bucketed by
   *
   * A subscription counts in the month it was APPROVED (`reviewed_at`) — that
   * is when the money became ours. A book order counts when it was PAID. An
   * expense counts on `occurred_on`, which is the month the money left, not the
   * day somebody typed it in. A refund counts on ITS OWN `occurred_on`, never
   * on the date of the sale it reverses: a September refund of a July payment
   * reduces September. July was read once, to close it, and a figure that moves
   * after that is one the owner cannot reconcile against what he actually did.
   * Each is the date that answers "what did this month make", and none of them
   * is `created_at`.
   */
  private async monthly(): Promise<FinanceMonth[]> {
    const rows = await this.prisma.$queryRaw<MonthlyRow[]>`
      WITH axis AS (
        SELECT to_char(month, 'YYYY-MM') AS month, month AS starts
        FROM generate_series(
          date_trunc('month', now()) - make_interval(months => ${MONTHS - 1}),
          date_trunc('month', now()),
          '1 month'
        ) AS month
      )
      SELECT
        a.month,
        (
          SELECT COALESCE(SUM(p."amount_cents"), 0)
          FROM "app"."payment_submissions" p
          WHERE p."status" = 'approved'
            AND p."is_free" = false
            AND p."reviewed_at" >= a.starts
            AND p."reviewed_at" <  a.starts + INTERVAL '1 month'
        ) AS subscription,
        (
          SELECT COALESCE(SUM(o."amount_cents"), 0)
          FROM "app"."book_orders" o
          WHERE ${BOOK_REVENUE_RAW}
            AND o."paid_at" >= a.starts
            AND o."paid_at" <  a.starts + INTERVAL '1 month'
        ) AS books,
        (
          SELECT COALESCE(SUM(e."amount_cents"), 0)
          FROM "app"."expenses" e
          WHERE e."occurred_on" >= a.starts::date
            AND e."occurred_on" <  (a.starts + INTERVAL '1 month')::date
        ) AS expenses,
        (
          SELECT COALESCE(SUM(r."amount_cents"), 0)
          FROM "app"."refunds" r
          WHERE r."submission_id" IS NOT NULL
            AND r."occurred_on" >= a.starts::date
            AND r."occurred_on" <  (a.starts + INTERVAL '1 month')::date
        ) AS "subscriptionRefunds",
        (
          SELECT COALESCE(SUM(r."amount_cents"), 0)
          FROM "app"."refunds" r
          WHERE r."book_order_id" IS NOT NULL
            AND r."occurred_on" >= a.starts::date
            AND r."occurred_on" <  (a.starts + INTERVAL '1 month')::date
        ) AS "bookRefunds"
      FROM axis a
      ORDER BY a.month DESC
    `;

    return rows.map((row) => {
      const subscriptionRevenueCents = toNumber(row.subscription);
      const bookRevenueCents = toNumber(row.books);
      const expensesCents = toNumber(row.expenses);
      const subscriptionRefundsCents = toNumber(row.subscriptionRefunds);
      const bookRefundsCents = toNumber(row.bookRefunds);
      return {
        month: row.month,
        subscriptionRevenueCents,
        bookRevenueCents,
        expensesCents,
        subscriptionRefundsCents,
        bookRefundsCents,
        // May be negative, and is left that way: a month that bought a print
        // run and sold nothing really did lose money — and a month whose only
        // movement was refunding an earlier one is genuinely negative too,
        // which is exactly why a refund is bucketed on its own date and never
        // on the sale's.
        netCents:
          subscriptionRevenueCents +
          bookRevenueCents -
          subscriptionRefundsCents -
          bookRefundsCents -
          expensesCents,
      };
    });
  }
}
