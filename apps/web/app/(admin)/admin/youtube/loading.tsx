import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';
import './youtube.css';

/**
 * The studio's shape while the channel and its first 50 uploads are read —
 * the same hero, health strip and 16/9 card grid the page renders, so nothing
 * jumps when it lands.
 */
export default function Loading() {
  return (
    <div className="yt" aria-busy="true">
      <RouteLoadingWatchdog />
      <div className="yt-hero yt-hero--skeleton">
        <Skeleton className="size-[4.5rem] shrink-0 rounded-full" />
        <div className="yt-skel-lines">
          <Skeleton width="narrow" className="h-7 max-w-64" />
          <Skeleton width="wide" className="h-4 max-w-96" />
        </div>
      </div>
      <div className="yt-health yt-health--skeleton">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[4.5rem] rounded-[var(--r-lg)]" />
        ))}
      </div>
      <div className="yt-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="yt-card yt-card--skeleton">
            <Skeleton className="aspect-[16/9] h-auto rounded-none" />
            <div className="space-y-2 p-3">
              <Skeleton width="wide" className="h-4" />
              <Skeleton width="narrow" className="h-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
