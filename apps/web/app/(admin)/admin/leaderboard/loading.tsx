import { Skeleton } from '@ayman/ui/components/skeleton';
import { copy } from '@ayman/contracts/copy/admin';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

const ROW_WIDTHS = ['wide', 'full', 'narrow', 'wide', 'full', 'narrow'] as const;

/**
 * نفس مناطق الصفحة بالترتيب — الهيرو، التابات، أربع بلاطات، المنصة
 * والمستويات، والقايمة — عشان مفيش حاجة تنط لما الدفعة ترجع. الهيرو بلونه
 * الحقيقي مش رمادي، زي سكيلتون «ترتيبي»: أول حاجة بتبان هي الشريط الملوّن،
 * ورمادي مكانه بيعمل «فلاش» لما يتبدّل.
 */
export default function LeaderboardLoading() {
  return (
    <div className="grid gap-6">
      <RouteLoadingWatchdog />
      <div className="h-44 rounded-lg bg-[color-mix(in_oklab,var(--viz-3)_55%,var(--viz-5))] opacity-70" />

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} width="narrow" className="h-10 w-40 rounded-full" />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-line bg-surface-2 p-4">
            <Skeleton width="narrow" className="h-7" />
            <Skeleton width={index % 2 === 0 ? 'narrow' : 'wide'} className="h-4" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-line bg-surface-2 p-5">
            <Skeleton width="narrow" className="h-5" />
            <Skeleton width="full" className="h-40" />
          </div>
        ))}
      </div>

      <div className="grid gap-3">
        {ROW_WIDTHS.map((width, index) => (
          <div key={index} className="rounded-lg border border-line bg-surface-2 px-4 py-4">
            <Skeleton width={width} />
          </div>
        ))}
      </div>
      <span className="sr-only">{copy.common.loading}</span>
    </div>
  );
}
