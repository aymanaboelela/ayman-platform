import { copy } from '@ayman/contracts/copy/admin';
import { AdminPaymentListSchema, AdminPaymentSortSchema } from '@ayman/contracts/admin/payments';
import { PaymentSubmissionStatusSchema, type PaymentSubmissionStatus } from '@ayman/contracts/payments';
import { adminGet } from '@/lib/admin-api';
import { ListControl } from '@/components/admin/list-controls';
import { PaymentsLiveList } from './payments-live-list';

const c = copy.admin.payments;

export const metadata = { title: c.title };

/** Fifty was already the page size; what was missing was any way to reach page
 *  two — the queue rendered the first fifty and stopped, with no indication
 *  there were more. See `ListPager`. */
const PER_PAGE = 50;

const FILTERS: { value: PaymentSubmissionStatus | 'all'; label: string }[] = [
  { value: 'pending', label: c.filterPending },
  { value: 'approved', label: c.filterApproved },
  { value: 'rejected', label: c.filterRejected },
  { value: 'all', label: c.filterAll },
];

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

  const one = (key: string): string | undefined => {
    const value = Array.isArray(params[key]) ? params[key][0] : params[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };
  const sort = AdminPaymentSortSchema.catch('oldest').parse(one('sort'));
  const page = Math.max(1, Number(one('page') ?? 1) || 1);

  const query =
    `perPage=${PER_PAGE}&page=${page}&sort=${sort}` + (status === 'all' ? '' : `&status=${status}`);
  const initial = await adminGet(`/api/admin/payments/submissions?${query}`, AdminPaymentListSchema);

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {c.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.subtitle}</p>

      {/* Dropdowns rather than a chip row — same reasoning as the subscribers
          screen, and the same shared control. The sort is the addition: the
          queue could only ever be read oldest-first, and «الأغلى الأول» is not
          a nicety here, a 1,200 EGP yearly claim and a 100 EGP monthly one are
          not the same thing to get wrong. */}
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <ListControl
          name="status"
          label={c.filterStatusLabel}
          value={status === 'all' ? '' : status}
          options={FILTERS.map((option) => ({
            value: option.value === 'all' ? '' : option.value,
            label: option.label,
          }))}
        />
        <ListControl
          name="sort"
          label={c.filterSortLabel}
          value={sort}
          options={[
            { value: 'oldest', label: c.sortOldest },
            { value: 'newest', label: c.sortNewest },
            { value: 'amount_desc', label: c.sortAmountDesc },
            { value: 'amount_asc', label: c.sortAmountAsc },
          ]}
        />
      </div>

      {/*
        The rows, and everything that keeps them current without a refresh —
        see `PaymentsLiveList`. Keyed on the query so a filter, sort or page
        change starts a fresh list rather than lighting up every row of the
        new view as «جديد».
      */}
      <PaymentsLiveList
        key={query}
        initial={initial}
        query={query}
        status={status}
        page={page}
        perPage={PER_PAGE}
      />
    </>
  );
}
