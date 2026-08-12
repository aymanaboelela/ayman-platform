import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * A Server Component, so this ships inside the SSR'd HTML. Mirrors the real
 * page's regions in order — header, identity strip, then one labelled grid — so
 * the layout does not jump when the four parallel fetches resolve.
 *
 * Six cards rather than a single row: the grid is three-up at `xl`, and a
 * one-row skeleton under a page that fills two rows collapses the scroll
 * height the moment real data lands.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-6 py-10 md:py-12">
      <div className="mb-6 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>

      <div className="panel flex items-center gap-3 p-4">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton width="narrow" className="h-3" />
          <Skeleton width="wide" className="h-5" />
        </div>
      </div>

      <div className="mt-10">
        <Skeleton width="narrow" className="mb-4 h-6" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="panel overflow-hidden" key={index}>
              <Skeleton className="aspect-video rounded-none" />
              <div className="space-y-3 p-4">
                <Skeleton width={index % 2 === 0 ? 'wide' : 'narrow'} className="h-5" />
                <Skeleton width="narrow" className="h-3" />
                <Skeleton className="h-2" />
                <Skeleton className="h-10 rounded-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
