import { notFound } from 'next/navigation';
import { getEntitlements } from '@/lib/entitlements';
import { copy } from '@ayman/contracts/copy/admin';
import { AdminTransferFilterSchema, AdminTransferListSchema } from '@ayman/contracts/admin/transfers';
import { adminGet } from '@/lib/admin-api';
import { ListControl } from '@/components/admin/list-controls';
import { IngestTransfersBox } from './transfer-actions';
import { TransfersLiveList } from './transfers-live-list';

const c = copy.admin.transfers;

export const metadata = { title: c.title };

/**
 * `/admin/transfers` — «التحويلات الواردة».
 *
 * Uncached (`adminGet`), like every other admin list: a stale ledger is money
 * that looks unexplained after it has already been explained.
 */
export default async function AdminTransfersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /*
   * القسم ده مش موجود على ستاك الفيتشر دي مقفولة فيه — والصف بتاعه في
   * `ADMIN_NAV` مش بيترسم أصلًا. ده الباب لو حد كتب الـURL بإيده.
   *
   * `notFound()` مش ٤٠٣: الصفحة مش «ممنوعة»، هي مش هنا. ونفس الشكل بالحرف
   * اللي `(admin)/layout.tsx` بيستخدمه، وبيشرح ليه فوقه.
   */
  if (!(await getEntitlements()).transfers) notFound();

  const params = await searchParams;
  const raw = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const filter = AdminTransferFilterSchema.catch('unmatched').parse(raw);

  const initial = await adminGet(`/api/admin/transfers?filter=${filter}`, AdminTransferListSchema);

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {c.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.subtitle}</p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <ListControl
          name="filter"
          label={c.filterStatusLabel}
          value={filter}
          options={[
            { value: 'unmatched', label: c.filterUnmatched },
            { value: 'matched', label: c.filterMatched },
            { value: 'dismissed', label: c.filterDismissed },
            { value: 'all', label: c.filterAll },
          ]}
        />
      </div>

      {/* Live, on the same queue frame as the review screen — see
          `TransfersLiveList`. Keyed on the filter for the reason the payments
          list is keyed on its query. */}
      <TransfersLiveList key={filter} initial={initial} filter={filter} />

      <IngestTransfersBox />
    </>
  );
}
