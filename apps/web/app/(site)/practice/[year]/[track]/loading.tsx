import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** The practice hero, then a grid of cards. A Server Component, so it ships in the SSR'd HTML. */
export default function Loading() {
  return (
    <div aria-hidden="true" className="practice-page">
      <RouteLoadingWatchdog />
      <section className="practice-hero">
        <div className="site-shell">
          <Skeleton className="mb-4 h-4 w-28" />
          <Skeleton className="mb-4 h-7 w-40 rounded-full" />
          <Skeleton width="narrow" className="mb-4 h-10" />
          <Skeleton width="wide" className="h-4" />
        </div>
      </section>
      <div className="site-shell practice-units">
        <div className="practice-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="practice-lesson">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton width={i % 2 ? 'narrow' : 'wide'} className="h-5" />
              <Skeleton width="narrow" className="h-3" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
