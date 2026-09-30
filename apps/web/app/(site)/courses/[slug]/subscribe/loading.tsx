import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/**
 * A Server Component skeleton, in the SSR'd HTML — same rule as its sibling
 * one level up, and the same `animation-delay: 180ms` that keeps a fast cache
 * hit from flashing it.
 *
 * Shaped like what actually lands: the «رجوع» line, the heading, and the
 * checkout card — its step bar, then the plan cards in their own card, three
 * across where there is room (`.bco-plans`). NOT the course page's
 * video-and-outline shape; a skeleton that promises the wrong page is worse
 * than a blank one.
 */
export default function Loading() {
  return (
    <div aria-hidden="true" className="mx-auto max-w-[var(--w-shell)] px-6 py-16">
      <RouteLoadingWatchdog />
      <Skeleton width="narrow" className="mb-6 h-3" />
      <Skeleton width="wide" className="mb-8 h-9" />
      <div className="max-w-[58rem] rounded-[1.25rem] border border-line p-5">
        <div className="mb-5 flex items-center gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-8 rounded-full" />
          ))}
        </div>
        <Skeleton width="narrow" className="mb-4 h-5" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} width="full" className="h-36 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
