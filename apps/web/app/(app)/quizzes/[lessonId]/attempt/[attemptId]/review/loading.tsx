import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/**
 * The review, before it lands — drawn from the page's own objects so nothing
 * moves when it does: the same gutter as `page.tsx`, the back link's row, the
 * title, a `.result-card` with its figures and bar, and `.review-card`s.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-prose)] px-4 py-8 md:px-6 md:py-10">
      <RouteLoadingWatchdog />
      <div className="mb-2 flex min-h-10 items-center">
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton width="wide" className="mb-6 h-7" />
      <div className="flex flex-col gap-6">
        <div className="result-card" data-band="pending">
          <div className="result-card__top">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-20 rounded-sm" />
          </div>
          <div className="result-card__figures">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-14 w-24 rounded-lg" />
          </div>
          <span className="result-card__meter" aria-hidden="true" />
          <Skeleton className="h-16 w-full rounded-md" />
        </div>
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="review-card">
            <div className="qhead">
              <Skeleton className="h-8 w-20 rounded-full" />
              <Skeleton className="h-7 w-16 rounded-full" />
            </div>
            <Skeleton width="full" />
            <Skeleton width="wide" />
          </div>
        ))}
      </div>
    </main>
  );
}
