import Link from 'next/link';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { AdminPaymentListSchema, type AdminPaymentRow } from '@ayman/contracts/admin/payments';
import { PaymentSubmissionStatusSchema, type PaymentSubmissionStatus } from '@ayman/contracts/payments';
import { cn } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { formatEGP } from '@/lib/price';
import { WhatsappButton } from '@/components/admin/whatsapp-button';
import { PaymentReviewActions } from './review-actions';
import { PaymentScreenshotThumbnail } from './screenshot-thumbnail';

const c = copy.admin.payments;

export const metadata = { title: c.title };

const FILTERS: { value: PaymentSubmissionStatus | 'all'; label: string }[] = [
  { value: 'pending', label: c.filterPending },
  { value: 'approved', label: c.filterApproved },
  { value: 'rejected', label: c.filterRejected },
  { value: 'all', label: c.filterAll },
];

const PLAN_LABEL: Record<AdminPaymentRow['plan'], string> = {
  monthly: c.planMonthly,
  quarterly: c.planQuarterly,
};

const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * `/admin/payments` — the Vodafone Cash review queue.
 *
 * Uncached (`adminGet`), like every other admin list: a stale queue is a
 * student waiting on a decision that already happened.
 */
export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.status) ? params.status[0] : params.status;
  // `'all'` is a screen-only value — the API's `status` param is the closed
  // three-value enum, and omitting the query key entirely is how it means
  // "every status" (see `PaymentsService.adminList`). An unrecognised value
  // falls back to the queue's whole point: what is waiting on a decision now.
  const status: PaymentSubmissionStatus | 'all' =
    raw === 'all' ? 'all' : PaymentSubmissionStatusSchema.safeParse(raw).success ? (raw as PaymentSubmissionStatus) : 'pending';

  const { rows, rowCount } = await adminGet(
    `/api/admin/payments/submissions?perPage=50${status === 'all' ? '' : `&status=${status}`}`,
    AdminPaymentListSchema,
  );

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {c.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.subtitle}</p>

      <nav className="mt-4 flex flex-wrap gap-1.5">
        {FILTERS.map((option) => (
          <Link
            key={option.value}
            href={`/admin/payments?status=${option.value}`}
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
        <ul className="mt-5 flex flex-col gap-2.5">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/students/${row.userId}`}
                    className="text-[length:var(--fs-text-base)] font-semibold text-fg underline decoration-dotted decoration-fg-faint underline-offset-4 hover:text-accent-text hover:decoration-solid"
                  >
                    {row.studentName}
                  </Link>
                  <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                    {PLAN_LABEL[row.plan]}
                  </span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                    {row.approvedBefore > 0
                      ? formatCopy(c.approvedBefore, { n: row.approvedBefore })
                      : c.approvedBeforeNone}
                  </span>
                </div>
                <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
                  {row.courseTitle}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-faint">
                  <span className="mono">{formatEGP(row.amountCents)} ج</span>
                  {/* The number to reconcile against the real Vodafone Cash
                      log — often not the student's own account phone below,
                      which is why it carries its own label and this one
                      doesn't: unlabelled reads as "the student's number",
                      which `studentPhone` already is. */}
                  <span dir="ltr" className="font-medium text-fg">
                    {c.senderPhoneLabel}: {row.senderPhone}
                  </span>
                  {row.studentPhone ? <span dir="ltr">{row.studentPhone}</span> : null}
                  {row.studentEmail ? <span dir="ltr">{row.studentEmail}</span> : null}
                  <time dateTime={row.createdAt}>{dateFormatter.format(new Date(row.createdAt))}</time>
                </p>
                {row.status === 'rejected' && row.rejectionReason ? (
                  <p className="mt-1.5 text-[length:var(--fs-text-sm)] text-err">
                    {row.rejectionReason}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <PaymentScreenshotThumbnail
                  id={row.id}
                  alt={formatCopy(c.screenshotAlt, { student: row.studentName })}
                />
                {/* The student's own account phone, not `senderPhone` above —
                    reconciling a Vodafone Cash transfer is one reason to
                    reach out, but not the only one, so this follows the
                    student rather than the payment. Renders nothing when
                    `studentPhone` is unusable — see `WhatsappButton`. */}
                <WhatsappButton phone={row.studentPhone} label={c.whatsapp} size="sm" />
                {row.status === 'pending' ? <PaymentReviewActions id={row.id} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
