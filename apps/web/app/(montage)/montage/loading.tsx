import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** The drop zone and a few rows — the list's own geometry. */
export default function MontageLoading() {
  return (
    <>
      <RouteLoadingWatchdog />
      <Skeleton width="wide" className="mb-4 h-4" />
      <Skeleton width="wide" className="h-48" />
      <div className="mt-5 grid gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} width="wide" className="h-28" />
        ))}
      </div>
    </>
  );
}
