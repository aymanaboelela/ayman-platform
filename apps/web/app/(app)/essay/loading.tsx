import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';
import '@/components/engagement/engagement.css';
import '@/components/essay/essay.css';

/** The header, then the question card in its real frame, then folded rows. */
export default function Loading() {
  return (
    <main className="es mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <RouteLoadingWatchdog />
      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>
      <div className="es-card">
        <div className="es-card__head">
          <Skeleton className="size-11 shrink-0 rounded-md" />
          <Skeleton width="narrow" className="h-6" />
        </div>
        <div className="es-card__body">
          <Skeleton width="wide" className="h-5" />
          <Skeleton width="narrow" className="h-5" />
          <Skeleton className="h-32 w-full rounded-md" />
        </div>
      </div>
      <div className="mt-8 space-y-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </main>
  );
}
