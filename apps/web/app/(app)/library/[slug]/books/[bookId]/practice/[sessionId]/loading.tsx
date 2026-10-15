import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
      <RouteLoadingWatchdog />
      <div className="mb-6 flex items-center justify-between">
        <Skeleton width="narrow" className="h-6" />
        <Skeleton className="h-8 w-24 rounded-sm" />
      </div>

      <div className="panel p-6">
        <Skeleton className="mb-4 h-6 w-3/4" />
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="rounded-md border border-line p-4" key={index}>
              <Skeleton width="wide" className="h-4" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
