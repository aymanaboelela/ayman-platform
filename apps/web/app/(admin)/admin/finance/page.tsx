import Link from 'next/link';
import { copy } from '@ayman/contracts/copy/admin';
import {
  AdminFinanceListSchema,
  type AdminFinanceRow,
  type FinancePlanFilter,
  type FinanceSort,
  type FinanceStatus,
  type FinanceStreamFilter,
} from '@ayman/contracts/admin/finance';
import { AdminBookOrderRevenueSummarySchema } from '@ayman/contracts/admin/book-orders';
import type { PaymentPlan } from '@ayman/contracts/payments';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { formatEGP } from '@/lib/price';
import { StatTile } from '@/components/admin/charts/stat-tile';
import { FinanceRowActions } from './finance-row-actions';

const c = copy.admin.finance;
const cp = copy.admin.payments;

export const metadata = { title: c.title };

const STATUS_FILTERS: { value: FinanceStatus | 'all'; label: string }[] = [
  { value: 'all', label: c.filterAll },
  { value: 'active', label: c.filterActive },
  { value: 'expiring_soon', label: c.filterExpiringSoon },
  { value: 'expired', label: c.filterExpired },
];

const PLAN_FILTERS: { value: FinancePlanFilter | 'all'; label: string }[] = [
  { value: 'all', label: c.filterPlanAll },
  { value: 'monthly', label: c.filterPlanMonthly },
  { value: 'quarterly', label: c.filterPlanQuarterly },
  { value: 'yearly', label: c.filterPlanYearly },
  { value: 'term', label: c.filterPlanTerm },
  { value: 'free', label: c.filterPlanFree },
];

const STREAM_FILTERS: { value: FinanceStreamFilter | 'all'; label: string }[] = [
  { value: 'all', label: c.filterStreamAll },
  { value: 'general', label: copy.stream.general },
  { value: 'languages', label: copy.stream.languages },
];

const PLAN_LABEL: Record<Exclude<PaymentPlan, 'term'>, string> = {
  monthly: cp.planMonthly,
  quarterly: cp.planQuarterly,
  yearly: cp.planYearly,
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
const VALID_PLANS = new Set<FinancePlanFilter>(['monthly', 'quarterly', 'yearly', 'term', 'free']);
const VALID_STREAMS = new Set<FinanceStreamFilter>(['general', 'languages']);

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `/admin/finance` — «مين دفع، قد إيه، واشتراكه هيخلص إمتى» — asked for as
 * top priority («ضروري ضروري ضروري»), later extended with filter/sort/
 * renewal-count controls and three mutations: correcting a misrecorded
 * amount, overriding a subscription's dates outright, and cancelling one
 * early with a reason (see `FinanceRowActions`).
 *
 * One row per live-or-lapsed subscription (`AdminFinanceRow` is grant-
 * centric — see the contract's own note), plus three summary tiles and a
 * SEPARATE book-order revenue tile (its own fetch, its own section — never
 * merged into the subscription total, see `BookOrdersService
 * .adminRevenueSummary`'s own note on why). Same server-component-and-
 * `adminGet` shape as `/admin/payments`: uncached, because a stale finance
 * screen is indistinguishable from a wrong one.
 */
export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const statusRaw = firstParam(params.status);
  const status: FinanceStatus | 'all' =
    statusRaw && VALID_STATUSES.has(statusRaw as FinanceStatus) ? (statusRaw as FinanceStatus) : 'all';

  const planRaw = firstParam(params.plan);
  const plan: FinancePlanFilter | 'all' =
    planRaw && VALID_PLANS.has(planRaw as FinancePlanFilter) ? (planRaw as FinancePlanFilter) : 'all';

  const yearRaw = firstParam(params.year);
  const year = yearRaw && /^\d+$/.test(yearRaw) ? Number(yearRaw) : undefined;

  const streamRaw = firstParam(params.stream);
  const stream: FinanceStreamFilter | 'all' =
    streamRaw && VALID_STREAMS.has(streamRaw as FinanceStreamFilter) ? (streamRaw as FinanceStreamFilter) : 'all';

  const sortRaw = firstParam(params.sort);
  const sort: FinanceSort = sortRaw === 'paid_asc' ? 'paid_asc' : 'paid_desc';

  const query = new URLSearchParams({ perPage: '200', sort });
  if (status !== 'all') query.set('status', status);
  if (plan !== 'all') query.set('plan', plan);
  if (year !== undefined) query.set('year', String(year));
  if (stream !== 'all') query.set('stream', stream);

  const [{ rows, rowCount, summary }, bookRevenue] = await Promise.all([
    adminGet(`/api/admin/finance?${query.toString()}`, AdminFinanceListSchema),
    adminGet('/api/admin/book-orders/summary', AdminBookOrderRevenueSummarySchema),
  ]);

  /** Preserves every OTHER active filter — only the given key(s) change. */
  function href(overrides: Record<string, string | number | undefined>): string {
    const next = new URLSearchParams();
    if (status !== 'all') next.set('status', status);
    if (plan !== 'all') next.set('plan', plan);
    if (year !== undefined) next.set('year', String(year));
    if (stream !== 'all') next.set('stream', stream);
    if (sort !== 'paid_desc') next.set('sort', sort);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) next.delete(key);
      else next.set(key, String(value));
    }
    const qs = next.toString();
    return qs.length > 0 ? `/admin/finance?${qs}` : '/admin/finance';
  }

  const planCount: Record<FinancePlanFilter, number> = summary.filterCounts.plan;
  const yearOptions = Object.keys(summary.filterCounts.year)
    .map(Number)
    .sort((a, b) => a - b);

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

      {/* الكتاب الورقي's own money — a physical good with no platform access
          behind it, deliberately never summed into the tiles above. */}
      <div className="mt-3 rounded-lg border border-line-subtle bg-surface-2 p-3">
        <p className="text-[length:var(--fs-mono-label)] text-fg-muted">{c.bookRevenueSectionTitle}</p>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatTile
            label={c.tileBookRevenue}
            value={`${formatEGP(bookRevenue.revenueThisMonthCents)} ج`}
            href="/admin/books?status=paid"
          />
          <StatTile
            label={c.tileBookPaidCount}
            value={String(bookRevenue.paidCount)}
            href="/admin/books?status=paid"
          />
        </div>
      </div>

      <nav className="mt-5 flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((option) => (
          <Link
            key={option.value}
            href={href({ status: option.value === 'all' ? undefined : option.value })}
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

      <nav className="mt-2 flex flex-wrap gap-1.5">
        {PLAN_FILTERS.map((option) => (
          <Link
            key={option.value}
            href={href({ plan: option.value === 'all' ? undefined : option.value })}
            aria-current={option.value === plan ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-[length:var(--fs-mono-label)]',
              'transition-colors duration-[160ms] ease-out',
              option.value === plan
                ? 'border-accent bg-accent text-[#1A1206]'
                : 'border-line-subtle text-fg-muted hover:border-accent/40 hover:text-fg',
            )}
          >
            {option.value === 'all'
              ? option.label
              : formatCopy(c.filterCount, { label: option.label, n: planCount[option.value] })}
          </Link>
        ))}
      </nav>

      <nav className="mt-2 flex flex-wrap gap-1.5">
        <Link
          key="year-all"
          href={href({ year: undefined })}
          aria-current={year === undefined ? 'page' : undefined}
          className={cn(
            'rounded-full border px-3 py-1 text-[length:var(--fs-mono-label)]',
            'transition-colors duration-[160ms] ease-out',
            year === undefined
              ? 'border-accent bg-accent text-[#1A1206]'
              : 'border-line-subtle text-fg-muted hover:border-accent/40 hover:text-fg',
          )}
        >
          {c.filterYearAll}
        </Link>
        {yearOptions.map((y) => (
          <Link
            key={`year-${y}`}
            href={href({ year: y })}
            aria-current={year === y ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-[length:var(--fs-mono-label)]',
              'transition-colors duration-[160ms] ease-out',
              year === y
                ? 'border-accent bg-accent text-[#1A1206]'
                : 'border-line-subtle text-fg-muted hover:border-accent/40 hover:text-fg',
            )}
          >
            {formatCopy(c.filterCount, {
              label: formatCopy(c.filterYearLabel, { year: y }),
              n: summary.filterCounts.year[String(y)] ?? 0,
            })}
          </Link>
        ))}

        {STREAM_FILTERS.map((option) => (
          <Link
            key={option.value}
            href={href({ stream: option.value === 'all' ? undefined : option.value })}
            aria-current={option.value === stream ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-[length:var(--fs-mono-label)]',
              'transition-colors duration-[160ms] ease-out',
              option.value === stream
                ? 'border-accent bg-accent text-[#1A1206]'
                : 'border-line-subtle text-fg-muted hover:border-accent/40 hover:text-fg',
            )}
          >
            {option.value === 'all'
              ? option.label
              : formatCopy(c.filterCount, {
                  label: option.label,
                  n: summary.filterCounts.stream[option.value],
                })}
          </Link>
        ))}

        <Link
          href={href({ sort: sort === 'paid_desc' ? 'paid_asc' : undefined })}
          className="rounded-full border border-line-subtle px-3 py-1 text-[length:var(--fs-mono-label)] text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:text-fg"
        >
          {sort === 'paid_desc' ? c.sortNewestFirst : c.sortOldestFirst}
        </Link>
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
          <table className="w-full min-w-[64rem] text-start text-[length:var(--fs-text-sm)]">
            <thead>
              <tr className="border-b border-line text-start text-fg-muted">
                <th className="p-3 text-start font-medium">{c.columnStudent}</th>
                <th className="p-3 text-start font-medium">{c.columnCourse}</th>
                <th className="p-3 text-start font-medium">{c.columnPlan}</th>
                <th className="p-3 text-start font-medium">{c.columnAmount}</th>
                <th className="p-3 text-start font-medium">{c.columnPaidAt}</th>
                <th className="p-3 text-start font-medium">{c.columnValidUntil}</th>
                <th className="p-3 text-start font-medium">{c.columnRenewals}</th>
                <th className="p-3 text-start font-medium">{c.columnStatus}</th>
                <th className="p-3 text-start font-medium">{c.columnActions}</th>
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
                  <td className="p-3 text-fg-muted">
                    {row.courseTitle}
                    {/* A term-scoped subscription, shown distinctly from a
                        whole-course one rather than as an unlabelled row
                        with no date — see `Course.terms`'s model doc. */}
                    {row.termId !== null ? (
                      <span className="mono block text-[length:var(--fs-mono-label)] text-fg-faint">
                        {formatCopy(c.termLabel, { term: row.termTitle ?? '' })}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-3 text-fg-muted">
                    {row.plan === 'term'
                      ? formatCopy(cp.planTerm, { term: row.termTitle ?? '' })
                      : row.plan
                        ? PLAN_LABEL[row.plan]
                        : c.noPayment}
                  </td>
                  <td className="mono p-3 text-fg-muted">
                    {/* An admin-comped term reads as «مجاني», not «٠ ج» — the
                        term still cost the course's own price, nothing was
                        actually collected. See the model note on
                        `PaymentSubmission.isFree`. */}
                    {row.isFree
                      ? c.freeBadge
                      : row.amountCents !== null
                        ? `${formatEGP(row.amountCents)} ج`
                        : c.noPayment}
                  </td>
                  <td className="mono p-3 text-fg-muted">{formatDate(row.paidAt)}</td>
                  <td className="mono p-3 text-fg">
                    {row.termId !== null ? c.noExpiryTermOpen : formatDate(row.validUntil)}
                  </td>
                  <td className="mono p-3 text-fg-muted">
                    {row.renewalCount > 0
                      ? formatCopy(c.renewalCountBadge, { n: row.renewalCount })
                      : c.renewalCountNone}
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5 text-fg-muted">
                      <span
                        aria-hidden="true"
                        className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[row.status])}
                      />
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td className="p-3">
                    <FinanceRowActions row={row} />
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
