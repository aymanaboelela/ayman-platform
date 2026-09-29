import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';
import '@/components/results/results.css';

/**
 * A Server Component, so this skeleton ships inside the SSR'd HTML. It mirrors
 * the settled page's regions in order — header, the hero (gauge beside its
 * sentence and four figures), the trend chart, then the exam cards — and it
 * is built on the page's own layout classes (`.rs`, `.rs-hero__grid`,
 * `.rs-stats`, `.rs-exams`), so the container queries that decide one column
 * or two decide it here too and nothing jumps sideways when the one
 * authenticated fetch resolves.
 *
 * The hero is drawn on the card surface rather than the ink panel: a skeleton
 * bar is a neutral wash, and on ink it would vanish in the light theme.
 *
 * The chart is drawn even for a student who has never sat an exam — the empty
 * state is a card of about the same height in the same place, so guessing
 * "there are results" costs little either way.
 */
export default function Loading() {
  return (
    <main className="rs mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10">
      <RouteLoadingWatchdog />
      <div className="mb-6 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>

      <div className="rs-card rs-hero-skel">
        <div className="rs-hero__grid">
          <Skeleton className="size-44 rounded-full" />
          <div className="w-full space-y-4">
            <Skeleton width="wide" className="h-6" />
            <ul className="rs-stats">
              {Array.from({ length: 4 }, (_, index) => (
                <li key={index} className="flex items-center gap-3 rounded-md border border-line p-3">
                  <Skeleton className="size-9 shrink-0 rounded-md" />
                  <div className="w-full space-y-2">
                    <Skeleton width="narrow" className="h-5" />
                    <Skeleton width={index % 2 === 0 ? 'wide' : 'narrow'} className="h-3" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="rs-section rs-card space-y-4">
        <Skeleton width="narrow" className="h-5" />
        <Skeleton width="full" className="h-40" />
      </div>

      <div className="rs-section space-y-4">
        <Skeleton width="narrow" className="h-6" />
        <ul className="rs-exams">
          {Array.from({ length: 2 }, (_, index) => (
            <li key={index} className="rs-card space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="size-16 shrink-0 rounded-full" />
                <div className="w-full space-y-2">
                  <Skeleton width={index % 2 === 0 ? 'wide' : 'narrow'} className="h-4" />
                  <Skeleton width="narrow" className="h-3" />
                </div>
              </div>
              <Skeleton width="full" className="h-14" />
              <Skeleton width="wide" className="h-10" />
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
