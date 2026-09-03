import { Injectable } from '@nestjs/common';
import type {
  AdminFinanceOverview,
  ExpenseCategory,
  FinanceMonth,
} from '@ayman/contracts/admin/expenses';
import { PrismaService } from '../../prisma/prisma.service';

/** How many months of trend the screen gets. Eighteen covers "this year and
 *  last autumn", which is the longest comparison anybody makes here, and keeps
 *  the payload a fixed small size no matter how old the platform gets. */
const MONTHS = 18;

interface MonthlyRow {
  month: string;
  subscription: bigint | number | null;
  books: bigint | number | null;
  expenses: bigint | number | null;
}

interface CostRow {
  cost: bigint | number | null;
  unknown: bigint | number | null;
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
 * that keeps an admin-comped term out of the money. Books: orders that are
 * `paid` or `shipped`, which is what `adminRevenueSummary` already counts. Two
 * screens computing revenue two ways is how one number ends up with two values.
 */
@Injectable()
export class FinanceOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<AdminFinanceOverview> {
    const [subscriptionRevenue, bookRevenue, expenseGroups, cost, months] = await Promise.all([
      this.prisma.paymentSubmission.aggregate({
        // Identical to the revenue tile's filter — see the class doc.
        where: { status: 'approved', isFree: false },
        _sum: { amountCents: true },
      }),
      this.prisma.bookOrder.aggregate({
        where: { status: { in: ['paid', 'shipped'] } },
        _sum: { amountCents: true },
      }),
      this.prisma.expense.groupBy({
        by: ['category'],
        _sum: { amountCents: true },
      }),
      this.bookCostOfSales(),
      this.monthly(),
    ]);

    const subscriptionRevenueCents = subscriptionRevenue._sum.amountCents ?? 0;
    const bookRevenueCents = bookRevenue._sum.amountCents ?? 0;
    const revenueTotalCents = subscriptionRevenueCents + bookRevenueCents;

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
      expensesTotalCents,
      expensesByCategory,
      bookCostOfSalesCents: cost.bookCostOfSalesCents,
      bookCostUnknownCount: cost.bookCostUnknownCount,
      netCents: revenueTotalCents - expensesTotalCents,
      months,
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
  }> {
    const rows = await this.prisma.$queryRaw<CostRow[]>`
      SELECT
        COALESCE(SUM(i."quantity" * b."unit_cost_cents"), 0) AS cost,
        COUNT(*) FILTER (WHERE b."unit_cost_cents" IS NULL)  AS unknown
      FROM "app"."book_order_items" i
      JOIN "app"."book_orders" o ON o."id" = i."order_id"
      LEFT JOIN "app"."books" b  ON b."id" = i."book_id"
      WHERE o."status" IN ('paid', 'shipped')
    `;

    const row = rows[0];
    return {
      bookCostOfSalesCents: toNumber(row?.cost ?? 0),
      bookCostUnknownCount: toNumber(row?.unknown ?? 0),
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
   * day somebody typed it in. Each is the date that answers "what did this
   * month make", and none of them is `created_at`.
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
          WHERE o."status" IN ('paid', 'shipped')
            AND o."paid_at" >= a.starts
            AND o."paid_at" <  a.starts + INTERVAL '1 month'
        ) AS books,
        (
          SELECT COALESCE(SUM(e."amount_cents"), 0)
          FROM "app"."expenses" e
          WHERE e."occurred_on" >= a.starts::date
            AND e."occurred_on" <  (a.starts + INTERVAL '1 month')::date
        ) AS expenses
      FROM axis a
      ORDER BY a.month DESC
    `;

    return rows.map((row) => {
      const subscriptionRevenueCents = toNumber(row.subscription);
      const bookRevenueCents = toNumber(row.books);
      const expensesCents = toNumber(row.expenses);
      return {
        month: row.month,
        subscriptionRevenueCents,
        bookRevenueCents,
        expensesCents,
        // May be negative, and is left that way: a month that bought a print
        // run and sold nothing really did lose money.
        netCents: subscriptionRevenueCents + bookRevenueCents - expensesCents,
      };
    });
  }
}
