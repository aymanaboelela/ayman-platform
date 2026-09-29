import { Skeleton } from '@ayman/ui/components/skeleton';
import { copy } from '@ayman/contracts/copy/admin';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** «أسئلة الألعاب»: العنوان والتبويبات وكروت الكورسات. */
export default function GamesLoading() {
  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <RouteLoadingWatchdog />
      <Skeleton width="narrow" className="h-4" />
      <Skeleton width="wide" className="mt-3 h-8" />
      <Skeleton width="full" className="mt-2 h-4" />
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-line bg-surface-2 p-4">
            <Skeleton width="narrow" className="h-4" />
            <Skeleton width="wide" className="mt-2 h-7" />
          </div>
        ))}
      </div>
      {[0, 1].map((section) => (
        <div key={section} className="mt-8 rounded-lg border border-line bg-surface-2 p-4">
          <Skeleton width="narrow" className="h-5" />
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} width="full" className="mt-3 h-14" />
          ))}
        </div>
      ))}
      <span className="sr-only">{copy.common.loading}</span>
    </div>
  );
}
