import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** The rail and a grid of tiles — the studio's own geometry. */
export default function StudioLoading() {
  return (
    <>
      <RouteLoadingWatchdog />
      <Skeleton width="wide" className="mb-4 h-4" />
      <div className="grid gap-4 lg:grid-cols-[17.5rem_1fr]">
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="wide" className="mb-2 h-12" />
          ))}
        </div>
        <div>
          <Skeleton width="wide" className="h-20" />
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} width="wide" className="h-56" />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
