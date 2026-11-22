import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** «ملفات PDF» — the head band, then two sideways file cards a row. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-6 py-10 md:py-12">
      <RouteLoadingWatchdog />
      <div className="panel mb-6 flex items-center gap-4 p-5">
        <Skeleton className="size-14 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton width="wide" className="h-8" />
          <Skeleton width="narrow" className="h-4" />
        </div>
      </div>
      <Skeleton width="narrow" className="mb-6 h-9 rounded-full" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="panel flex gap-4 p-4">
            <Skeleton className="aspect-[3/4] w-24 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton width="narrow" className="h-4" />
              <Skeleton width={index % 2 ? 'narrow' : 'wide'} className="h-5" />
              <Skeleton width="wide" className="h-3" />
              <Skeleton width="narrow" className="h-9" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
