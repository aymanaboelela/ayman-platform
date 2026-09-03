import { AdminBookRowSchema } from '@ayman/contracts/admin/books';
import {
  AdminExpenseListSchema,
  ExpenseCategorySchema,
  type ExpenseCategory,
} from '@ayman/contracts/admin/expenses';
import { copy } from '@ayman/contracts/copy/admin';
import { z } from 'zod';
import { adminGet } from '@/lib/admin-api';
import { formatEGP } from '@/lib/price';
import { FinanceTabs } from '../finance-tabs';
import { ExpenseDialog } from './expense-dialog';
import { ExpenseRowActions } from './expense-row-actions';

const c = copy.admin.expenses;
const cat = copy.admin.expenseCategory;

export const metadata = { title: c.title };

/** `YYYY-MM-DD` → «٣ أكتوبر ٢٠٢٦», Western digits like every other date here. */
function dateLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)));
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
  const category = ExpenseCategorySchema.safeParse(params.category);
  const month = typeof params.month === 'string' ? params.month : undefined;

  const query = new URLSearchParams({ perPage: '100' });
  if (category.success) query.set('category', category.data);
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) query.set('month', month);

  const [list, books] = await Promise.all([
    adminGet(`/api/admin/expenses?${query.toString()}`, AdminExpenseListSchema),
    adminGet('/api/admin/books', z.array(AdminBookRowSchema)),
  ]);

  const bookOptions = books.map((book) => ({ id: book.id, titleAr: book.titleAr }));

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {c.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.subtitle}</p>

      <FinanceTabs active="/admin/finance/expenses" />

      <div className="mt-5">
        <ExpenseDialog books={bookOptions} />
      </div>

      {list.rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-line-subtle bg-surface-2 p-6 text-center">
          <p className="text-[length:var(--fs-text-base)] text-fg">{c.empty}</p>
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.emptyHint}</p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-[length:var(--fs-text-sm)]">
            <thead>
              <tr className="border-b border-line text-fg-muted">
                <th className="p-2 text-start font-medium">{c.columnDate}</th>
                <th className="p-2 text-start font-medium">{c.columnCategory}</th>
                <th className="p-2 text-start font-medium">{c.columnTitle}</th>
                <th className="p-2 text-start font-medium">{c.columnBook}</th>
                <th className="p-2 text-end font-medium">{c.columnAmount}</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {list.rows.map((row) => (
                <tr key={row.id} className="border-b border-line-subtle align-top">
                  <td className="whitespace-nowrap p-2 text-fg-muted">
                    {dateLabel(row.occurredOn)}
                  </td>
                  <td className="p-2 text-fg-muted">{cat[row.category as ExpenseCategory]}</td>
                  <td className="p-2 text-fg">
                    {row.titleAr}
                    {row.noteAr ? (
                      <span className="block text-[length:var(--fs-text-xs)] text-fg-muted">
                        {row.noteAr}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-2 text-fg-muted">
                    {/* «الكتاب ×٥٠٠» — the count is the half that says what the
                        run actually bought, so it never renders without it. */}
                    {row.bookTitleAr ? `${row.bookTitleAr} ×${row.quantity ?? 0}` : '—'}
                  </td>
                  <td className="whitespace-nowrap p-2 text-end font-medium tabular-nums text-fg">
                    {formatEGP(row.amountCents)} ج
                  </td>
                  <td className="p-2 text-end">
                    <ExpenseRowActions row={row} books={bookOptions} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
