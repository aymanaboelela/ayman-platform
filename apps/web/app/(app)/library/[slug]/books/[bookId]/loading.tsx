import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
      <RouteLoadingWatchdog />
      <Skeleton width="narrow" className="mb-6 h-4" />

      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>

      <div className="panel mb-8 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton width="narrow" className="h-4" />
            <Skeleton width="wide" className="h-6" />
          </div>
          <Skeleton className="h-10 w-32 rounded-sm" />
        </div>
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="panel p-4" key={index}>
            <div className="flex items-center justify-between">
              <Skeleton width="wide" className="h-5" />
              <Skeleton className="h-8 w-24 rounded-sm" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
