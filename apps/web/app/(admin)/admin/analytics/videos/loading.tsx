import { Skeleton } from '@ayman/ui/components/skeleton';
import { copy } from '@ayman/contracts/copy/admin';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

const ROW_WIDTHS = ['full', 'wide', 'narrow', 'wide', 'full', 'narrow'] as const;

/** The videos tab's geometry: title, tab strip, period switcher, four tiles,
 *  the chart pair, then the table — so the swap to the real page moves nothing. */
export default function VideoAnalyticsLoading() {
  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <RouteLoadingWatchdog />
      <Skeleton width="narrow" className="h-8" />
      <Skeleton width="wide" className="mt-2 h-4" />
      <Skeleton width="full" className="mt-4 h-9" />
      <Skeleton width="narrow" className="mt-4 h-8 max-w-96" />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-line bg-surface-2 p-4">
            <Skeleton width="narrow" className="h-4" />
            <Skeleton width="wide" className="mt-2 h-7" />
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface-2 p-5 lg:col-span-2">
          <Skeleton width="narrow" className="h-5" />
          <Skeleton width="full" className="mt-4 h-44" />
        </div>
        <div className="rounded-lg border border-line bg-surface-2 p-5">
          <Skeleton width="narrow" className="h-5" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width={i % 2 === 0 ? 'full' : 'wide'} className="mt-4 h-6" />
          ))}
        </div>
      </div>

      <div className="mt-6 w-full overflow-hidden rounded-[var(--r-lg)] border border-line">
        {ROW_WIDTHS.map((width, index) => (
          <div key={index} className="flex items-center gap-3 border-b border-line-subtle px-3 py-3 last:border-b-0">
            <Skeleton width="narrow" className="aspect-video h-auto w-24 shrink-0 rounded-md" />
            <Skeleton width={width} />
          </div>
        ))}
      </div>
      <span className="sr-only">{copy.common.loading}</span>
    </div>
  );
}
