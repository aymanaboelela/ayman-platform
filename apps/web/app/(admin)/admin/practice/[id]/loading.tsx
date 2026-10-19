import { Skeleton } from '@ayman/ui/components/skeleton';
import { copy } from '@ayman/contracts/copy/admin';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';
import '@/components/admin/practice/practice-admin.css';

/** The set editor: band, then the question cards beside the lesson's fields. */
export default function AdminPracticeSetLoading() {
  return (
    <>
      <RouteLoadingWatchdog />
      <section className="stage">
        <div className="stage__body">
          <Skeleton width="narrow" className="h-3 bg-[rgb(255_255_255/0.2)]" />
          <Skeleton width="wide" className="mt-3 h-8 bg-[rgb(255_255_255/0.2)]" />
          <div className="prx-hero__actions">
            <Skeleton className="h-11 w-40 bg-[rgb(255_255_255/0.2)]" />
            <Skeleton className="h-11 w-32 bg-[rgb(255_255_255/0.2)]" />
          </div>
        </div>
      </section>
      <div className="prx-layout">
        <div className="prx-main">
          <Skeleton className="h-10 w-72" />
          {[0, 1, 2].map((row) => (
            <div key={row} className="prx-q">
              <Skeleton width="narrow" className="h-7" />
              <Skeleton width="full" className="h-5" />
              <Skeleton width="wide" className="h-20" />
            </div>
          ))}
        </div>
        <div className="prx-panel">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-10" />
          ))}
        </div>
      </div>
      <span className="sr-only">{copy.common.loading}</span>
    </>
  );
}
