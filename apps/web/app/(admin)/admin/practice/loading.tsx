import { Skeleton } from '@ayman/ui/components/skeleton';
import { copy } from '@ayman/contracts/copy/admin';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';
import '@/components/admin/practice/practice-admin.css';

/**
 * «اختبارات مجانية»: the band, four tiles, the filters and a grid of cards —
 * in the page's own classes, so nothing jumps when the sets land. A Server
 * Component, like every skeleton.
 */
export default function AdminPracticeLoading() {
  return (
    <>
      <RouteLoadingWatchdog />
      <section className="stage">
        <div className="stage__body">
          <Skeleton width="narrow" className="h-3 bg-[rgb(255_255_255/0.2)]" />
          <Skeleton width="wide" className="mt-3 h-8 bg-[rgb(255_255_255/0.2)]" />
          <div className="prx-hero__actions">
            <Skeleton className="h-11 w-36 bg-[rgb(255_255_255/0.2)]" />
          </div>
        </div>
      </section>
      <div className="prx-stats">
        {[0, 1, 2, 3].map((tile) => (
          <Skeleton key={tile} className="h-20" />
        ))}
      </div>
      <div className="prx-filters">
        <Skeleton className="h-11 w-64" />
        <Skeleton className="h-11 w-56" />
      </div>
      <div className="prx-grid">
        {[0, 1, 2, 3, 4, 5].map((card) => (
          <Skeleton key={card} className="h-56 rounded-lg" />
        ))}
      </div>
      <span className="sr-only">{copy.common.loading}</span>
    </>
  );
}
