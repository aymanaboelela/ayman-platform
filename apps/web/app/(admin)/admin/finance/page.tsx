import Link from 'next/link';
import { copy } from '@ayman/contracts/copy/admin';
import { AdminFinanceListSchema, type AdminFinanceRow, type FinanceStatus } from '@ayman/contracts/admin/finance';
import type { PaymentPlan } from '@ayman/contracts/payments';
import { cn } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { formatEGP } from '@/lib/price';
import { StatTile } from '@/components/admin/charts/stat-tile';

const c = copy.admin.finance;
const cp = copy.admin.payments;

export const metadata = { title: c.title };

const FILTERS: { value: FinanceStatus | 'all'; label: string }[] = [
  { value: 'all', label: c.filterAll },
  { value: 'active', label: c.filterActive },
  { value: 'expiring_soon', label: c.filterExpiringSoon },
  { value: 'expired', label: c.filterExpired },
];

const PLAN_LABEL: Record<PaymentPlan, string> = {
  monthly: cp.planMonthly,
  quarterly: cp.planQuarterly,
};

const STATUS_LABEL: Record<FinanceStatus, string> = {
  active: c.statusActive,
  expiring_soon: c.statusExpiringSoon,
  expired: c.statusExpired,
};

const STATUS_DOT: Record<FinanceStatus, string> = {
  active: 'bg-[oklch(0.62_0.15_150)]',
  expiring_soon: 'bg-accent',
  expired: 'bg-fg-faint',
};

const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' });

function formatDate(iso: string | null): string {
  return iso ? dateFormatter.format(new Date(iso)) : c.noPayment;
}

const VALID_STATUSES = new Set<FinanceStatus>(['active', 'expiring_soon', 'expired']);

/**
 * `/admin/finance` — «مين دفع، قد إيه، واشتراكه هيخلص إمتى» — asked for as
 * top priority («ضروري ضروري ضروري»).
 *
 * One row per live-or-lapsed subscription (`AdminFinanceRow` is grant-
 * centric — see the contract's own note), plus three summary tiles. Same
 * server-component-and-`adminGet` shape as `/admin/payments`: uncached,
 * because a stale finance screen is indistinguishable from a wrong one.
 */
export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.status) ? params.status[0] : params.status;
  const status: FinanceStatus | 'all' = raw === 'all' || raw === undefined ? 'all' : VALID_STATUSES.has(raw as FinanceStatus) ? (raw as FinanceStatus) : 'all';

  const { rows, rowCount, summary } = await adminGet(
    `/api/admin/finance?perPage=50${status === 'all' ? '' : `&status=${status}`}`,
    AdminFinanceListSchema,
  );

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {c.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.subtitle}</p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label={c.tileRevenue} value={`${formatEGP(summary.revenueThisMonthCents)} ج`} accent />
        <StatTile
          label={c.tileActive}
          value={String(summary.activeCount)}
          href="/admin/finance?status=active"
        />
        <StatTile
          label={c.tileExpiringSoon}
          value={String(summary.expiringSoonCount)}
          href="/admin/finance?status=expiring_soon"
        />
      </div>

      <nav className="mt-5 flex flex-wrap gap-1.5">
        {FILTERS.map((option) => (
          <Link
            key={option.value}
            href={`/admin/finance?status=${option.value}`}
            aria-current={option.value === status ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[length:var(--fs-text-sm)]',
              'transition-colors duration-[160ms] ease-out',
              option.value === status
                ? 'border-accent bg-accent text-[#1A1206]'
                : 'border-line text-fg-muted hover:border-accent/40 hover:text-fg',
            )}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {rowCount === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.empty}</p>
          <p className="mx-auto mt-2 max-w-[34rem] text-[length:var(--fs-text-sm)] text-fg-muted">
            {c.emptyHint}
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-surface-2">
          <table className="w-full min-w-[48rem] text-start text-[length:var(--fs-text-sm)]">
            <thead>
              <tr className="border-b border-line text-start text-fg-muted">
                <th className="p-3 text-start font-medium">{c.columnStudent}</th>
                <th className="p-3 text-start font-medium">{c.columnCourse}</th>
                <th className="p-3 text-start font-medium">{c.columnPlan}</th>
                <th className="p-3 text-start font-medium">{c.columnAmount}</th>
                <th className="p-3 text-start font-medium">{c.columnPaidAt}</th>
                <th className="p-3 text-start font-medium">{c.columnValidUntil}</th>
                <th className="p-3 text-start font-medium">{c.columnStatus}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: AdminFinanceRow) => (
                <tr key={row.id} className="border-b border-line-subtle last:border-b-0">
                  <td className="p-3">
                    <Link
                      href={`/admin/students/${row.userId}`}
                      className="font-medium text-fg underline decoration-dotted decoration-fg-faint underline-offset-4 hover:text-accent-text hover:decoration-solid"
                    >
                      {row.studentName}
                    </Link>
                  </td>
                  <td className="p-3 text-fg-muted">{row.courseTitle}</td>
                  <td className="p-3 text-fg-muted">{row.plan ? PLAN_LABEL[row.plan] : c.noPayment}</td>
                  <td className="mono p-3 text-fg-muted">
                    {row.amountCents !== null ? `${formatEGP(row.amountCents)} ج` : c.noPayment}
                  </td>
                  <td className="mono p-3 text-fg-muted">{formatDate(row.paidAt)}</td>
                  <td className="mono p-3 text-fg">{formatDate(row.validUntil)}</td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5 text-fg-muted">
                      <span
                        aria-hidden="true"
                        className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[row.status])}
                      />
                      {STATUS_LABEL[row.status]}
                    </span>
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
