import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** Mirrors a lesson quiz: the short hero, then the intro card. */
export default function Loading() {
  return (
    <div aria-hidden="true" className="practice-page">
      <RouteLoadingWatchdog />
      <section className="practice-hero practice-hero--lesson">
        <div className="site-shell">
          <Skeleton className="mb-4 h-4 w-28" />
          <Skeleton className="mb-3 h-7 w-48 rounded-full" />
          <Skeleton width="narrow" className="h-10" />
        </div>
      </section>
      <div className="site-shell practice-run">
        <div className="practice-card practice-intro">
          <Skeleton width="full" className="h-4" />
          <Skeleton width="wide" className="h-4" />
          <Skeleton className="h-11 w-40 rounded-md" />
        </div>
      </div>
    </div>
  );
}
