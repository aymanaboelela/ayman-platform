import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/**
 * The archive skeleton. A Server Component, so it ships inside the SSR'd HTML
 * rather than waiting on hydration — same as every other skeleton here.
 *
 * Geometry matches the real page: the dark band, the row of round chips,
 * then a tier of medal cards — each a disc over a name over a mark. Widths
 * vary — uniform bars are the classic cheap-skeleton tell.
 */
export default function Loading() {
  return (
    <div aria-hidden="true" className="honor-hall site-shell">
      <RouteLoadingWatchdog />
      <div className="hall-hero">
        <div className="hall-hero__text">
          <Skeleton width="narrow" className="mb-4 h-5" />
          <Skeleton width="wide" className="mb-3 h-12" />
          <Skeleton width="full" className="h-4" />
        </div>
      </div>

      <ul className="hall-rounds__list hall-rounds">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="hall-rounds__item">
            <Skeleton width={i === 0 ? 'wide' : 'narrow'} className="mb-2 h-4" />
            <Skeleton width="full" className="h-3" />
          </li>
        ))}
      </ul>

      <ol className="hall-cards hall-races">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="hall-card">
            <Skeleton className="hall-card__face" />
            <Skeleton width={i % 2 === 0 ? 'wide' : 'full'} className="h-5" />
            <Skeleton width="narrow" className="h-4" />
          </li>
        ))}
      </ol>
    </div>
  );
}
