import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/**
 * A question book's page before it lands: the same `.stage` band, the same
 * contents heading and `.unit` cards the real page draws, with grey inside —
 * so the band does not appear out of nowhere above a list that then moves.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
      <RouteLoadingWatchdog />
      <div className="stage mb-8">
        <div className="stage__body flex flex-col gap-3">
          <Skeleton className="h-3 w-24 opacity-60" />
          <Skeleton className="mt-2 h-3 w-40 opacity-60" />
          <Skeleton width="wide" className="h-9 opacity-60" />
          <Skeleton width="full" className="h-4 opacity-60" />
          <Skeleton className="mt-3 h-10 w-56 rounded-sm opacity-60" />
        </div>
      </div>

      <div className="group-head">
        <span className="group-head__mark" aria-hidden="true" />
        <Skeleton className="h-6 w-32" />
      </div>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="unit">
          <div className="unit__head">
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton width="wide" className="h-5" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </div>
      ))}
    </main>
  );
}
