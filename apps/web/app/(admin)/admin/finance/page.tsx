import Link from 'next/link';
import { AdminFinanceOverviewSchema } from '@ayman/contracts/admin/expenses';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { formatEGP } from '@/lib/price';
import { StatTile } from '@/components/admin/charts/stat-tile';
import { FinanceTabs } from './finance-tabs';

const c = copy.admin.finance;
const cat = copy.admin.expenseCategory;

export const metadata = { title: c.overviewTitle };

/** EGP, with the sign kept. `formatEGP` takes piastres and returns a bare
 *  number, so a negative net has to keep its «−» here or a losing month reads
 *  as a winning one. */
function egp(cents: number): string {
  return `${cents < 0 ? '−' : ''}${formatEGP(Math.abs(cents))} ج`;
}

/** `YYYY-MM` → «أكتوبر ٢٠٢٦». Built from the same locale every other date on
 *  the platform uses, with Western digits per the standing rule. */
function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1)),
  );
}

/**
 * «النظرة العامة» — the whole business on one screen.
 *
 * Asked for by name: «أنا لما أضغط عليها يبقى باين فيها كل حاجة، صرفت كام،
 * دفعت كام، المكسب الصافي … والفلوس اللي جت من الاشتراكات والفلوس اللي جت من
 * الكتب ومكسب الكتب إيه».
 *
 * ## One fetch
 *
 * Every figure comes from `GET /api/admin/expenses/overview`, which computes
 * them together. The screen adds nothing up itself — `netCents` in particular
 * is the API's, because two surfaces subtracting their own way is how «صافي
 * الربح» ends up with two values.
 *
 * ## Why the book profit is not `bookRevenue − printing expenses`
 *
 * A print run is money that left in the month the printer was paid; the cost of
 * a SALE is what the copies that shipped cost to make. Subtracting invoices
 * would show a catastrophic loss in any month with a run and no sales, on books
 * that are sitting in a box. See `FinanceOverviewService.bookCostOfSales`.
 */
export default async function FinanceOverviewPage() {
  const overview = await adminGet('/api/admin/expenses/overview', AdminFinanceOverviewSchema);

  const bookProfitCents = overview.bookRevenueCents - overview.bookCostOfSalesCents;
  const months = overview.months.filter(
    (month) =>
      month.subscriptionRevenueCents > 0 || month.bookRevenueCents > 0 || month.expensesCents > 0,
  );

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {c.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {c.overviewTitle}
      </h1>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.overviewSubtitle}</p>

      <FinanceTabs active="/admin/finance" />

      {/* The three that answer the question in one line: in, out, left. */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label={c.tileRevenueTotal} value={egp(overview.revenueTotalCents)} accent />
        <StatTile
          label={c.tileExpensesTotal}
          value={egp(overview.expensesTotalCents)}
          href="/admin/finance/expenses"
        />
        {/* Not an `accent` tile: amber is the "press this" colour in this
            system, and the net is the one number on the page nobody clicks. */}
        <StatTile label={c.tileNet} value={egp(overview.netCents)} />
      </div>

      {/* Where the money came FROM — the split Ayman asked for by name. */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label={c.tileSubscriptionRevenue}
          value={egp(overview.subscriptionRevenueCents)}
          href="/admin/finance/subscriptions"
        />
        <StatTile
          label={c.tileBookRevenue}
          value={egp(overview.bookRevenueCents)}
          href="/admin/books?status=paid"
        />
        <StatTile label={c.tileBookProfit} value={egp(bookProfitCents)} />
      </div>

      {/* Said out loud rather than folded silently into the number above: the
          margin is understated by exactly these lines, and a figure that hides
          what it could not count is a guess wearing a number's clothes. */}
      {overview.bookCostUnknownCount > 0 ? (
        <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg-muted">
          {formatCopy(c.bookCostUnknown, { n: overview.bookCostUnknownCount })}{' '}
          {/* The sentence named a problem and pointed at nothing. «تكلفة
              النسخة» is a field on the BOOK, two screens away, and there was
              no way to learn that from here — so the margin stayed understated
              because the fix was undiscoverable, not because it was hard. */}
          <Link href="/admin/books/catalog" className="text-accent-text underline">
            {c.bookCostFix}
          </Link>
        </p>
      ) : null}

      {overview.expensesByCategory.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-[length:var(--fs-title-3)] font-medium text-fg">
            {c.expensesByCategory}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {overview.expensesByCategory.map((entry) => {
              const share =
                overview.expensesTotalCents > 0
                  ? (entry.amountCents / overview.expensesTotalCents) * 100
                  : 0;
              return (
                <li key={entry.category} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-[length:var(--fs-text-sm)] text-fg">
                    {cat[entry.category]}
                  </span>
                  {/* The bar is decoration over a number that is already
                      written beside it, so it is `aria-hidden` rather than a
                      progressbar a screen reader has to narrate twice. */}
                  <span
                    aria-hidden="true"
                    className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3"
                  >
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ inlineSize: `${Math.max(share, 2)}%` }}
                    />
                  </span>
                  <span className="w-28 shrink-0 text-end text-[length:var(--fs-text-sm)] tabular-nums text-fg">
                    {egp(entry.amountCents)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-[length:var(--fs-title-3)] font-medium text-fg">{c.monthlyTitle}</h2>

        {months.length === 0 ? (
          <p className="mt-3 text-[length:var(--fs-text-sm)] text-fg-muted">{c.monthlyEmpty}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-[length:var(--fs-text-sm)]">
              <thead>
                <tr className="border-b border-line text-fg-muted">
                  <th className="p-2 text-start font-medium">{c.monthColumn}</th>
                  <th className="p-2 text-end font-medium">{c.monthSubscriptions}</th>
                  <th className="p-2 text-end font-medium">{c.monthBooks}</th>
                  <th className="p-2 text-end font-medium">{c.monthExpenses}</th>
                  <th className="p-2 text-end font-medium">{c.monthNet}</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month) => (
                  <tr key={month.month} className="border-b border-line-subtle">
                    <td className="p-2 text-fg">{monthLabel(month.month)}</td>
                    <td className="p-2 text-end tabular-nums text-fg-muted">
                      {egp(month.subscriptionRevenueCents)}
                    </td>
                    <td className="p-2 text-end tabular-nums text-fg-muted">
                      {egp(month.bookRevenueCents)}
                    </td>
                    <td className="p-2 text-end tabular-nums text-fg-muted">
                      {egp(month.expensesCents)}
                    </td>
                    {/* A losing month is red, and it is the only red on this
                        page — so it reads as "this one", not as an error. */}
                    <td
                      className={cn(
                        'p-2 text-end font-medium tabular-nums',
                        month.netCents < 0 ? 'text-[var(--err)]' : 'text-fg',
                      )}
                    >
                      {egp(month.netCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
