import Link from 'next/link';
import { CalendarDays, LayoutGrid, Receipt, Wallet } from 'lucide-react';
import { AdminBookRowSchema } from '@ayman/contracts/admin/books';
import {
  AdminExpenseListSchema,
  ExpenseCategorySchema,
  type AdminExpenseRow,
  type ExpenseCategory,
} from '@ayman/contracts/admin/expenses';
import { copy } from '@ayman/contracts/copy/admin';
import { z } from 'zod';
import { adminGet } from '@/lib/admin-api';
import { formatEGP } from '@/lib/price';
import { FinanceTabs } from '../finance-tabs';
import { ExpenseDialog } from './expense-dialog';
import { EXPENSE_LOOK } from './expense-look';
import { ExpenseRowActions } from './expense-row-actions';

const c = copy.admin.expenses;
const cat = copy.admin.expenseCategory;

export const metadata = { title: c.title };

/** `YYYY-MM` → «أكتوبر ٢٠٢٦». */
function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1)),
  );
}

/** `YYYY-MM-DD` → «٣٠ أكتوبر» — the year is already on the month heading above. */
function dayLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'long' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

const egp = (cents: number) => `${formatEGP(cents)} ج`;

/** The rows, in the order they came, cut wherever the month changes. */
function byMonth(rows: readonly AdminExpenseRow[]): { month: string; rows: AdminExpenseRow[] }[] {
  const groups: { month: string; rows: AdminExpenseRow[] }[] = [];
  for (const row of rows) {
    const month = row.occurredOn.slice(0, 7);
    const last = groups.at(-1);
    if (last?.month === month) last.rows.push(row);
    else groups.push({ month, rows: [row] });
  }
  return groups;
}

/**
 * المصروفات — the ledger's write side, as a screen.
 *
 * ## Why the book list is fetched here
 *
 * The dialog needs it to offer «ده طبعة كتاب إيه», and it is a client component
 * — so either it fetches on mount (a spinner inside a dialog, for a list of
 * five) or the server hands it over already loaded. `book:read` is held by the
 * same admin, and the list is small enough that it costs less than the loading
 * state would.
 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsedCategory = ExpenseCategorySchema.safeParse(params.category);
  const category = parsedCategory.success ? parsedCategory.data : undefined;
  const month =
    typeof params.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month)
      ? params.month
      : undefined;

  const query = new URLSearchParams({ perPage: '100' });
  if (category) query.set('category', category);
  if (month) query.set('month', month);

  const [list, books] = await Promise.all([
    adminGet(`/api/admin/expenses?${query.toString()}`, AdminExpenseListSchema),
    adminGet('/api/admin/books', z.array(AdminBookRowSchema)),
  ]);

  const bookOptions = books.map((book) => ({ id: book.id, titleAr: book.titleAr }));
  const { summary } = list;

  /** A link to this screen with one filter changed and the other kept. */
  const hrefWith = (next: { category?: ExpenseCategory | null; month?: string | null }) => {
    const out = new URLSearchParams();
    const nextCategory = next.category === undefined ? category : next.category;
    const nextMonth = next.month === undefined ? month : next.month;
    if (nextCategory) out.set('category', nextCategory);
    if (nextMonth) out.set('month', nextMonth);
    const qs = out.toString();
    return qs ? `/admin/finance/expenses?${qs}` : '/admin/finance/expenses';
  };

  // The two pickers' own «all» totals. Each breakdown already ignores its own
  // filter (see `AdminExpenseSummarySchema`), so these are sums of it, not a
  // second request.
  const categoriesTotal = summary.byCategory.reduce((sum, e) => sum + e.amountCents, 0);
  const monthsTotal = summary.byMonth.reduce((sum, e) => sum + e.amountCents, 0);
  const monthTotals = new Map(summary.byMonth.map((entry) => [entry.month, entry.amountCents]));
  const top = summary.byCategory[0];
  const scope = [month ? monthLabel(month) : c.filterMonthAll, category ? cat[category] : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="exp">
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {c.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.subtitle}</p>

      <FinanceTabs active="/admin/finance/expenses" />

      {/* ── the figure ──────────────────────────────────────────────────── */}
      <section className="exp-hero" aria-label={c.summaryTotal}>
        <div className="exp-hero__main">
          <p className="exp-hero__label">
            <Wallet aria-hidden="true" />
            {c.summaryTotal}
            <span className="exp-hero__scope">{scope}</span>
          </p>
          <p className="exp-hero__figure">
            {formatEGP(summary.totalCents)}
            <span>ج</span>
          </p>
          <p className="exp-hero__meta">
            <span>{c.summaryCount.replace('{n}', String(summary.count))}</span>
            {top && !category ? (
              <span>{c.summaryTop.replace('{category}', cat[top.category])}</span>
            ) : null}
          </p>
        </div>
        <div className="exp-hero__action">
          <ExpenseDialog books={bookOptions} />
        </div>

        {/* Where the money went, as one bar. Decoration over the cards
            below, which carry the same numbers in words. */}
        {categoriesTotal > 0 && !category ? (
          <div className="exp-stack" aria-hidden="true">
            {summary.byCategory.map((entry) => (
              <span
                key={entry.category}
                data-hue={EXPENSE_LOOK[entry.category].hue}
                style={{ flexGrow: entry.amountCents }}
                title={`${cat[entry.category]} — ${egp(entry.amountCents)}`}
              />
            ))}
          </div>
        ) : null}
      </section>

      {/* ── months ──────────────────────────────────────────────────────── */}
      {summary.byMonth.length > 0 ? (
        <nav className="exp-months" aria-label={c.monthsTitle}>
          <CalendarDays aria-hidden="true" className="exp-months__icon" />
          <Link
            href={hrefWith({ month: null })}
            aria-current={!month ? 'page' : undefined}
            className="exp-chip"
          >
            {c.filterMonthAll}
            <span className="exp-chip__sum">{egp(monthsTotal)}</span>
          </Link>
          {summary.byMonth.map((entry) => (
            <Link
              key={entry.month}
              href={hrefWith({ month: entry.month })}
              aria-current={month === entry.month ? 'page' : undefined}
              className="exp-chip"
            >
              {monthLabel(entry.month)}
              <span className="exp-chip__sum">{egp(entry.amountCents)}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {/* ── categories ──────────────────────────────────────────────────── */}
      {summary.byCategory.length > 0 ? (
        <section className="mt-6">
          <h2 className="exp-title">{c.categoriesTitle}</h2>
          <div className="exp-cats">
            <Link
              href={hrefWith({ category: null })}
              aria-current={!category ? 'page' : undefined}
              className="exp-cat"
              data-hue="all"
            >
              <span className="exp-cat__icon">
                <LayoutGrid aria-hidden="true" />
              </span>
              <span className="exp-cat__name">{c.filterCategoryAll}</span>
              <span className="exp-cat__sum">{egp(categoriesTotal)}</span>
              <span className="exp-cat__meta">
                {c.summaryCount.replace(
                  '{n}',
                  String(summary.byCategory.reduce((sum, e) => sum + e.count, 0)),
                )}
              </span>
            </Link>
            {summary.byCategory.map((entry) => {
              const { icon: Icon, hue } = EXPENSE_LOOK[entry.category];
              const share = categoriesTotal > 0 ? (entry.amountCents / categoriesTotal) * 100 : 0;
              return (
                <Link
                  key={entry.category}
                  href={hrefWith({ category: category === entry.category ? null : entry.category })}
                  aria-current={category === entry.category ? 'page' : undefined}
                  className="exp-cat"
                  data-hue={hue}
                >
                  <span className="exp-cat__icon">
                    <Icon aria-hidden="true" />
                  </span>
                  <span className="exp-cat__name">{cat[entry.category]}</span>
                  <span className="exp-cat__sum">{egp(entry.amountCents)}</span>
                  <span className="exp-cat__meta">
                    {c.summaryCount.replace('{n}', String(entry.count))} ·{' '}
                    {c.categoryShare.replace('{n}', String(Math.round(share)))}
                  </span>
                  <span className="exp-cat__bar" aria-hidden="true">
                    <span style={{ inlineSize: `${Math.max(share, 2)}%` }} />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ── the ledger ──────────────────────────────────────────────────── */}
      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="exp-title">{c.ledgerTitle}</h2>
          {category || month ? (
            <Link href="/admin/finance/expenses" className="exp-clear">
              {c.clearFilters}
            </Link>
          ) : null}
        </div>

        {list.rows.length === 0 ? (
          <div className="mt-3 rounded-lg border border-line-subtle bg-surface-2 p-6 text-center">
            <Receipt aria-hidden="true" className="mx-auto mb-2 size-8 text-fg-muted" />
            <p className="text-[length:var(--fs-text-base)] text-fg">{c.empty}</p>
            <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.emptyHint}</p>
          </div>
        ) : (
          <div className="exp-ledger">
            {byMonth(list.rows).map((group) => (
              <div key={group.month} className="exp-month">
                <p className="exp-month__head">
                  <span>{monthLabel(group.month)}</span>
                  <span className="exp-month__sum">
                    {egp(monthTotals.get(group.month) ?? 0)}
                  </span>
                </p>
                <ul>
                  {group.rows.map((row) => {
                    const { icon: Icon, hue } = EXPENSE_LOOK[row.category];
                    return (
                      <li key={row.id} className="exp-row" data-hue={hue}>
                        <span className="exp-row__icon">
                          <Icon aria-hidden="true" />
                        </span>
                        <div className="exp-row__body">
                          <p className="exp-row__title">{row.titleAr}</p>
                          <p className="exp-row__sub">
                            <span className="exp-tag">{cat[row.category]}</span>
                            <span>{dayLabel(row.occurredOn)}</span>
                            {/* «الكتاب ×٥٠٠» — the count is the half that says
                                what the run actually bought, so it never
                                renders without it. */}
                            {row.bookTitleAr ? (
                              <span>{`${row.bookTitleAr} ×${row.quantity ?? 0}`}</span>
                            ) : null}
                          </p>
                          {row.noteAr ? <p className="exp-row__note">{row.noteAr}</p> : null}
                        </div>
                        <span className="exp-row__amount">{egp(row.amountCents)}</span>
                        <div className="exp-row__actions">
                          <ExpenseRowActions row={row} books={bookOptions} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            <p className="exp-ledger__total">
              <span>{c.ledgerTotal}</span>
              <span>{egp(summary.totalCents)}</span>
            </p>
          </div>
        )}

        {list.rowCount > list.rows.length ? (
          <p className="mt-2 text-[length:var(--fs-text-xs)] text-fg-muted">
            {c.ledgerCapped
              .replace('{shown}', String(list.rows.length))
              .replace('{total}', String(list.rowCount))}
          </p>
        ) : null}
      </section>
    </div>
  );
}
