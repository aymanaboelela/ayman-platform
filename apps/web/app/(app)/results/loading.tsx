import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';
import '@/components/results/results.css';

/**
 * A Server Component, so this skeleton ships inside the SSR'd HTML. It mirrors
 * the settled page's regions in order — header, the hero (the ring and its
 * words beside the bars), then the exam rows — on the page's own layout
 * classes (`.rs`, `.rs-hero-skel`, `.rs-exams`), so the container queries that
 * decide one column or two decide it here too and nothing jumps sideways when
 * the one authenticated fetch resolves.
 *
 * The hero is drawn on the card surface rather than the ink panel: a skeleton
 * bar is a neutral wash, and on ink it would vanish in the light theme.
 */
export default function Loading() {
  return (
    <main className="rs mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
      <RouteLoadingWatchdog />
      <div className="mb-5 space-y-3">
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>

      <div className="rs-card rs-hero-skel">
        <div className="flex items-center gap-4">
          <Skeleton className="size-28 shrink-0 rounded-full" />
          <div className="w-full space-y-3">
            <Skeleton width="wide" className="h-6" />
            <Skeleton width="narrow" className="h-4" />
          </div>
        </div>
        <Skeleton width="full" className="h-32" />
      </div>

      <div className="rs-section space-y-4">
        <Skeleton width="narrow" className="h-6" />
        <ul className="rs-exams">
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index} className="rs-card flex items-center gap-3">
              <Skeleton className="size-14 shrink-0 rounded-md" />
              <div className="w-full space-y-2">
                <Skeleton width={index % 2 === 0 ? 'wide' : 'narrow'} className="h-4" />
                <Skeleton width="narrow" className="h-3" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
