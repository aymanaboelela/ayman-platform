import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** `/pdfs` — the head band, then a row of file cards. A `<div aria-hidden>`,
 *  not a `<main>`: see `app/loading.tsx` on skeletons and landmarks — and on
 *  `route-skeleton`, which keeps it from flashing on a first load. */
export default function Loading() {
  return (
    <div aria-hidden="true" className="route-skeleton">
      <RouteLoadingWatchdog />
      <div className="page-head">
        <div className="site-shell flex flex-col items-center gap-3">
          <Skeleton width="narrow" className="h-3" />
          <Skeleton width="wide" className="h-10" />
          <Skeleton width="wide" className="h-4" />
        </div>
      </div>
      <div className="site-shell grid gap-5 pb-16 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="site-card flex gap-4 p-4">
            <Skeleton className="aspect-[3/4] w-24 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton width="narrow" className="h-3" />
              <Skeleton width="wide" className="h-5" />
              <Skeleton width="full" className="h-3" />
              <Skeleton className="h-9 w-28 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
