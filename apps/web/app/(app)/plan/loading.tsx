import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';
import '@/components/engagement/engagement.css';

/**
 * The header, the hero in its real gradient (a grey bar swapped for colour
 * flashes on load — same reason as `backlog/loading.tsx`), then rows.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <RouteLoadingWatchdog />
      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>
      <div className="eg-hero eg-hero--loading" data-hue="blue" />
      <div className="mt-5 space-y-3 rounded-lg border border-line p-4">
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
