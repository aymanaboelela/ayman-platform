import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** The hero and the two big choices — what the page paints first anyway. */
export default function ReserveLoading() {
  return (
    <main className="rsv" aria-busy="true">
      <RouteLoadingWatchdog />
      <div className="rsv-hero">
        <Skeleton width="wide" className="h-7 w-36" />
        <Skeleton width="wide" className="h-11 w-3/4" />
      </div>
      <div className="rsv-grid">
        <Skeleton width="wide" className="h-26 rounded-2xl" />
        <Skeleton width="wide" className="h-26 rounded-2xl" />
      </div>
    </main>
  );
}
