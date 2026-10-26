import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/**
 * Header, the hero in its real colour (a grey bar swapped for a gradient
 * flashes on load — same reason as `path/loading.tsx`), the four tiles, then
 * one course card's worth of rows.
 */
export default function BacklogLoading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <RouteLoadingWatchdog />
      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>

      <div className="h-44 rounded-lg bg-[color-mix(in_oklab,var(--viz-4)_60%,var(--viz-3))] opacity-70" />

      <div className="mb-8 mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} width="full" className="h-[4.75rem] rounded-lg" />
        ))}
      </div>

      <div className="space-y-3 rounded-lg border border-line p-4">
        <Skeleton width="narrow" className="h-6" />
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="size-10 shrink-0 rounded-md" />
            <Skeleton width={index % 2 === 0 ? 'wide' : 'narrow'} className="h-5" />
          </div>
        ))}
      </div>
    </main>
  );
}
