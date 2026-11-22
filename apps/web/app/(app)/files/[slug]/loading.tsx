import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** The reader — the file's head card, then the frame. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-6 py-8 md:py-10">
      <RouteLoadingWatchdog />
      <Skeleton width="narrow" className="mb-4 h-4" />
      <div className="panel flex gap-5 p-5">
        <Skeleton className="aspect-[3/4] w-28 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton width="narrow" className="h-4" />
          <Skeleton width="wide" className="h-8" />
          <Skeleton width="wide" className="h-4" />
          <Skeleton width="narrow" className="h-10" />
        </div>
      </div>
      <Skeleton className="mt-5 h-[60vh] w-full rounded-lg" />
    </main>
  );
}
