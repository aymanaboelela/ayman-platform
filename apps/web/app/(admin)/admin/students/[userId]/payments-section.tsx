import Link from 'next/link';
import { Gift, ReceiptText, RefreshCw, Undo2, UserPlus, type LucideIcon } from 'lucide-react';
import {
  AdminStudentPaymentsSchema,
  type StudentPaymentKind,
  type StudentPaymentRow,
  type StudentPaymentVia,
} from '@ayman/contracts/admin/finance-daily';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Skeleton } from '@ayman/ui/components/skeleton';
import { adminGetOrForbidden } from '@/lib/admin-api';
import { formatAmount, formatCount } from '@/components/admin/money/money-format';

const c = copy.admin.money;
const cp = copy.admin.payments;

/** The same pair of hues as «الفلوس يوم بيوم» — new is green, renewal is
 *  blue, comped is the muted grey — so the two screens read as one story. */
const KIND_HUE: Record<StudentPaymentKind, string> = {
  new: 'var(--viz-6)',
  renewal: 'var(--viz-5)',
  free: 'var(--viz-muted)',
};

const KIND_ICON: Record<StudentPaymentKind, LucideIcon> = {
  new: UserPlus,
  renewal: RefreshCw,
  free: Gift,
};

const VIA_LABEL: Record<StudentPaymentVia, string> = {
  instapay: c.viaInstapay,
  manual: c.viaManual,
  review: c.viaReview,
};

/** Day, month and year with the time — a student's history spans terms, so
 *  the year earns its place here where the daily screen drops it. */
const WHEN = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: 'Africa/Cairo',
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function whatWasBought(row: StudentPaymentRow): string {
  if (row.months.length > 0) return row.months.map((month) => month.title).join('، ');
  if (row.plan === 'term') {
    return formatCopy(cp.planTerm, { term: row.termTitle ?? '—' });
  }
  if (row.plan === 'quarterly') return cp.planQuarterly;
  if (row.plan === 'yearly') return cp.planYearly;
  return cp.planMonthly;
}

function kindLabel(row: StudentPaymentRow): string {
  if (row.kind === 'free') return c.kindFree;
  if (row.kind === 'renewal') return formatCopy(c.kindRenewal, { n: formatCount(row.sequence ?? 2) });
  return c.kindNew;
}

/**
 * «الاشتراكات والفلوس» on a student's page — every approved payment, newest
 * first, each marked new / renewal / free by the same rule as the daily
 * screen.
 *
 * Its own section rather than more of `SubscriptionSection`, which lists
 * GRANTS (what the student holds, with the controls to cancel it). This lists
 * PAYMENTS: a student who bought «شهر ١» then «شهر ٢ و٣» holds three grants
 * behind two payments, and «جدّد كام مرة» is a question about the payments.
 *
 * Streamed behind its own boundary: one more read the profile form must not
 * wait for. `OrForbidden`, because the route is `payment:read` and this page
 * is opened by roles that do not hold it — for them the panel says so.
 */
export async function PaymentsSection({ userId }: { userId: string }) {
  const data = await adminGetOrForbidden(
    `/api/admin/finance/students/${encodeURIComponent(userId)}`,
    AdminStudentPaymentsSchema,
  );

  return (
    <section className="panel p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="money-tile__well"
            style={{ '--tile-hue': 'var(--viz-1)' } as React.CSSProperties}
            aria-hidden="true"
          >
            <ReceiptText className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{c.studentTitle}</h2>
            <p className="mt-1 max-w-[var(--w-prose)] text-[length:var(--fs-text-xs)] text-fg-muted">
              {c.studentLead}
            </p>
          </div>
        </div>
        <Link
          href="/admin/analytics/money"
          className="shrink-0 rounded-full border border-line px-3 py-1 text-[length:var(--fs-text-xs)] text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:text-fg"
        >
          {c.goToDaily}
        </Link>
      </header>

      {data === null ? (
        <div className="rounded-lg border border-dashed border-line p-6 text-center">
          <p className="text-fg-muted">{copy.admin.settings.panelForbidden}</p>
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
            {copy.admin.settings.panelForbiddenHint}
          </p>
        </div>
      ) : data.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-6 text-center text-fg-muted">
          {c.studentEmpty}
        </p>
      ) : (
        <>
          <dl className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={c.studentPaid} value={formatAmount(data.totals.paidCents)} hue="var(--viz-1)" />
            <Stat
              label={c.studentRefunded}
              value={data.totals.refundedCents > 0 ? formatAmount(-data.totals.refundedCents) : '—'}
              hue="var(--viz-4)"
            />
            <Stat label={c.studentNet} value={formatAmount(data.totals.netCents)} hue="var(--viz-2)" />
            <Stat
              label={c.studentRenewals}
              value={formatCount(data.totals.renewalCount)}
              hue={KIND_HUE.renewal}
            />
          </dl>

          <ol className="pay-timeline">
            {data.rows.map((row) => {
              const Icon = KIND_ICON[row.kind];
              return (
                <li
                  key={row.submissionId}
                  className="pay-row"
                  style={{ '--chip-hue': KIND_HUE[row.kind] } as React.CSSProperties}
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <p className="font-semibold text-fg">{row.courseTitle}</p>
                      <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{whatWasBought(row)}</p>
                    </div>
                    <p className="tabular text-[length:var(--fs-title-4)] font-semibold text-fg">
                      {row.isFree ? c.kindFree : formatAmount(row.amountCents)}
                    </p>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="money-chip">
                      <Icon className="size-3.5" aria-hidden="true" />
                      {kindLabel(row)}
                    </span>
                    <span className="money-item">{VIA_LABEL[row.via]}</span>
                    {row.refundedCents > 0 ? (
                      <span
                        className="money-chip"
                        style={{ '--chip-hue': 'var(--viz-4)' } as React.CSSProperties}
                      >
                        <Undo2 className="size-3.5" aria-hidden="true" />
                        {formatCopy(c.refundedNote, { amount: formatAmount(row.refundedCents) })}
                      </span>
                    ) : null}
                    <time
                      dateTime={row.paidAt}
                      className="ms-auto text-[length:var(--fs-text-xs)] text-fg-muted"
                    >
                      {WHEN.format(new Date(row.paidAt))}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, hue }: { label: string; value: string; hue: string }) {
  return (
    <div
      className="money-tile flex-col gap-1 rounded-lg border p-3"
      style={{ '--tile-hue': hue } as React.CSSProperties}
    >
      <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{label}</dt>
      <dd className="tabular text-[length:var(--fs-title-4)] font-semibold text-fg">{value}</dd>
    </div>
  );
}

/** The panel's shape while it streams — a header and three rows. */
export function PaymentsSectionSkeleton() {
  return (
    <div className="panel p-5" aria-hidden="true">
      <Skeleton width="narrow" className="h-4" />
      <Skeleton width="wide" className="mt-2 h-3" />
      <div className="mt-5 flex flex-col gap-3">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} width="full" className="h-16" />
        ))}
      </div>
    </div>
  );
}
