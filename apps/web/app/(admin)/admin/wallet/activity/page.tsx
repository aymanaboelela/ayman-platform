import Link from 'next/link';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import {
  AdminWalletActivityFilterSchema,
  AdminWalletActivitySchema,
  type AdminWalletActivityFilter,
} from '@ayman/contracts/admin/wallet';
import { cn } from '@ayman/ui/lib/cn';
import { adminGet } from '@/lib/admin-api';
import { formatEGPExact } from '@/lib/price';
import { StatTile } from '@/components/admin/charts/stat-tile';
import { WalletStatementTable } from '@/components/admin/wallet/wallet-statement-table';

const c = copy.admin.wallet;

export const metadata = { title: c.activityTitle };

const egp = (cents: number) => `${formatEGPExact(cents)} ج`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * «سجل الحركات» — every wallet movement on the platform, newest first, with
 * whose wallet, who did it and why. «أعرف الحاجات اللي حصلت».
 *
 * Server-rendered and paged by link (`?before=<id>`), so the page is a plain
 * URL he can keep open or send, and «هات أقدم» needs no client state.
 */
export default async function AdminWalletActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; before?: string }>;
}) {
  const params = await searchParams;
  const filter: AdminWalletActivityFilter = AdminWalletActivityFilterSchema.catch('admin').parse(params.filter);
  const before = params.before && UUID.test(params.before) ? params.before : undefined;

  const query = new URLSearchParams({ filter });
  if (before) query.set('before', before);
  const activity = await adminGet(`/api/admin/wallets/activity?${query}`, AdminWalletActivitySchema);

  return (
    <>
      <Link
        href="/admin/wallet"
        className="inline-flex items-center gap-1 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        <ArrowRight className="size-4" aria-hidden="true" />
        {c.back}
      </Link>

      <h1 className="mt-2 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.activityTitle}</h1>
      <p className="mt-1 max-w-[46rem] text-[length:var(--fs-text-sm)] text-fg-muted">{c.activityLead}</p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatTile label={c.activityCredited} value={egp(activity.totals.creditedCents)} tint="var(--ok)" accent />
        <StatTile label={c.activityDebited} value={egp(activity.totals.debitedCents)} tint="var(--err)" />
      </div>

      <div role="group" aria-label={c.activityTitle} className="mt-5 flex flex-wrap gap-2">
        {(['admin', 'all'] as const).map((value) => (
          <Link
            key={value}
            href={`/admin/wallet/activity?filter=${value}`}
            aria-current={filter === value ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 items-center rounded-full px-4 text-[length:var(--fs-text-sm)] font-semibold transition-colors duration-[160ms]',
              filter === value
                ? 'bg-[color:var(--viz-6)] text-[color:var(--n-1)]'
                : 'border border-[color-mix(in_oklab,var(--viz-6)_35%,var(--border))] bg-surface-1 text-fg hover:border-[color:var(--viz-6)]',
            )}
          >
            {value === 'admin' ? c.activityAdmin : c.activityAll}
          </Link>
        ))}
      </div>

      {activity.rows.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-line p-6 text-center text-fg-muted">
          {c.activityEmpty}
        </p>
      ) : (
        <WalletStatementTable rows={activity.rows} />
      )}

      {activity.nextBefore ? (
        <p className="mt-4">
          <Link
            href={`/admin/wallet/activity?filter=${filter}&before=${activity.nextBefore}`}
            className="inline-flex h-10 items-center gap-1 rounded-full border border-line bg-surface-2 px-4 text-[length:var(--fs-text-sm)] font-semibold text-fg hover:border-[color:var(--viz-6)]"
          >
            {c.activityMore}
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Link>
        </p>
      ) : null}
    </>
  );
}
