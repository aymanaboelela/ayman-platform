import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** «الكتب الخارجية» — a heading, then one course's row list. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-6 py-10 md:py-12">
      <RouteLoadingWatchdog />
      <div className="mb-10 space-y-3">
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>
      <Skeleton width="narrow" className="mb-4 h-6" />
      <div className="panel space-y-4 p-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton width={index === 1 ? 'narrow' : 'wide'} className="h-4" />
              <Skeleton width="narrow" className="h-3" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
