import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** The centre's name, the tiles and a few cards — the panel's own geometry. */
export default function CenterLoading() {
  return (
    <>
      <RouteLoadingWatchdog />
      <Skeleton width="wide" className="mb-4 h-8" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} width="wide" className="h-20" />
        ))}
      </div>
      <div className="mt-6 grid gap-3 xl:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} width="wide" className="h-56" />
        ))}
      </div>
    </>
  );
}
