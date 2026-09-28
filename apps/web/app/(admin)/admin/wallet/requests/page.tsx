import { copy } from '@ayman/contracts/copy/admin';
import { AdminWalletTopupListSchema } from '@ayman/contracts/admin/wallet';
import { PaymentSubmissionStatusSchema, type PaymentSubmissionStatus } from '@ayman/contracts/payments';
import { adminGet } from '@/lib/admin-api';
import { can, getSession } from '@/lib/session';
import { ListControl } from '@/components/admin/list-controls';
import { TopupsLiveList } from './topups-live-list';

const c = copy.admin.wallet;

export const metadata = { title: c.requestsTitle };

/** One of `PAGE_SIZES` — see `new-admin-screen-traps`. */
const PER_PAGE = 50;

/**
 * `/admin/wallet/requests` — «طلبات الشحن».
 *
 * The payments queue's shape exactly: the first render on the server, then
 * `TopupsLiveList` keeps it current off the `wallet-topups` frame on the tab's
 * one live stream — a request a student sends appears here with nobody
 * pressing refresh, and the badge in the sidebar moves with it.
 */
export default async function WalletTopupsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string): string | undefined => {
    const value = Array.isArray(params[key]) ? params[key][0] : params[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };
  const raw = one('status');
  const status: PaymentSubmissionStatus | 'all' =
    raw === 'all'
      ? 'all'
      : PaymentSubmissionStatusSchema.safeParse(raw).success
        ? (raw as PaymentSubmissionStatus)
        : 'pending';
  const sort = one('sort') === 'newest' ? 'newest' : 'oldest';
  const page = Math.max(1, Number(one('page') ?? 1) || 1);

  const query = `perPage=${PER_PAGE}&page=${page}&sort=${sort}` + (status === 'all' ? '' : `&status=${status}`);
  const [session, initial] = await Promise.all([
    getSession(),
    adminGet(`/api/admin/wallet-topups?${query}`, AdminWalletTopupListSchema),
  ]);

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">{c.eyebrow}</p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.requestsTitle}</h1>
      <p className="mt-1 max-w-[46rem] text-[length:var(--fs-text-sm)] text-fg-muted">{c.requestsLead}</p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <ListControl
          name="status"
          label={c.filterStatus}
          value={status}
          options={[
            { value: 'pending', label: c.filterPending },
            { value: 'approved', label: c.filterApproved },
            { value: 'rejected', label: c.filterRejected },
            { value: 'all', label: c.filterAll },
          ]}
        />
        <ListControl
          name="sort"
          label={c.sortLabel}
          value={sort}
          options={[
            { value: 'oldest', label: c.sortOldest },
            { value: 'newest', label: c.sortNewest },
          ]}
        />
      </div>

      <TopupsLiveList
        key={query}
        initial={initial}
        query={query}
        status={status}
        page={page}
        perPage={PER_PAGE}
        canReview={can(session, 'payment:review')}
      />
    </>
  );
}
