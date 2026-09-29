import { Skeleton } from '@ayman/ui/components/skeleton';
import { copy } from '@ayman/contracts/copy/admin';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** One video's page: thumbnail beside the title, six tiles, two charts, the
 *  retention curve beside the hour chart, then the lists. */
export default function VideoStatsLoading() {
  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <RouteLoadingWatchdog />
      <Skeleton width="narrow" className="h-4 max-w-32" />
      <div className="mt-4 grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
        <Skeleton width="full" className="aspect-video h-auto max-w-sm rounded-md" />
        <div>
          <Skeleton width="wide" className="h-8" />
          <Skeleton width="narrow" className="mt-2 h-4" />
          <Skeleton width="narrow" className="mt-3 h-5" />
        </div>
      </div>
      <Skeleton width="full" className="mt-5 h-9" />
      <Skeleton width="narrow" className="mt-4 h-8 max-w-96" />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-lg border border-line bg-surface-2 p-4">
            <Skeleton width="narrow" className="h-4" />
            <Skeleton width="wide" className="mt-2 h-7" />
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-lg border border-line bg-surface-2 p-5">
            <Skeleton width="narrow" className="h-5" />
            <Skeleton width="full" className="mt-4 h-44" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface-2 p-5 lg:col-span-2">
          <Skeleton width="narrow" className="h-5" />
          <Skeleton width="full" className="mt-4 h-44" />
        </div>
        <div className="rounded-lg border border-line bg-surface-2 p-5">
          <Skeleton width="narrow" className="h-5" />
          <Skeleton width="full" className="mt-4 h-44" />
        </div>
      </div>
      <span className="sr-only">{copy.common.loading}</span>
    </div>
  );
}
