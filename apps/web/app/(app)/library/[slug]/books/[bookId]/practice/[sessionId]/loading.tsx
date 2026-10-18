import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/**
 * The practice runner before it lands, built from the runner's own classes —
 * the same promise `quizzes/…/attempt/[attemptId]/loading.tsx` makes, for the
 * same reason: a skeleton in a different shape is worse than a blank box,
 * because the eye commits to where things are about to be. The back link and
 * the heading reserve their rows; the bar, the card and its four options, the
 * foot and the map are the real objects with grey inside.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
      <RouteLoadingWatchdog />
      <div className="mb-2 flex min-h-10 items-center">
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="practice-head">
        <Skeleton className="h-3 w-28" />
        <Skeleton width="wide" className="h-7" />
      </div>

      <div className="runner">
        <div className="runner__main">
          <div className="runner-bar">
            <div className="runner-bar__progress">
              <Skeleton width="narrow" className="h-3" />
              <span className="runner-bar__meter" aria-hidden="true" />
            </div>
          </div>

          <div className="runner-card">
            <div className="flex flex-col gap-5">
              <div className="qhead">
                <Skeleton className="h-8 w-20 rounded-full" />
                <Skeleton className="h-7 w-24 rounded-full" />
              </div>
              <Skeleton width="full" className="h-5" />
              <Skeleton width="wide" className="h-5" />
              <ul className="flex flex-col gap-2">
                {Array.from({ length: 4 }, (_, index) => (
                  <li key={index} className="runner-option pointer-events-none">
                    <Skeleton className="size-9 shrink-0" />
                    <Skeleton width={index % 2 === 0 ? 'full' : 'wide'} className="h-[1lh]" />
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="runner-foot">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>

        <aside className="runner-nav">
          <Skeleton width="narrow" className="mb-3 h-4" />
          <div className="runner-nav__grid">
            {Array.from({ length: 10 }, (_, index) => (
              <Skeleton key={index} className="h-11 w-11 shrink-0 md:h-9 md:w-9" />
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
