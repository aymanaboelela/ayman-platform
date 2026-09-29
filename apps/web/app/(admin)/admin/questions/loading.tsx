import { Skeleton } from '@ayman/ui/components/skeleton';
import { copy } from '@ayman/contracts/copy/admin';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';
import '@/components/admin/quiz/question-bank.css';

/**
 * «بنك الأسئلة»: the band, three tiles, and the list beside its categories —
 * in the page's own classes (`.qbank-layout`, `.qrow`), so the columns do not
 * jump when the real bank lands. A Server Component, like every skeleton.
 */
export default function QuestionBankLoading() {
  return (
    <>
      <RouteLoadingWatchdog />
      <section className="stage">
        <div className="stage__body">
          <Skeleton width="narrow" className="h-3 bg-[rgb(255_255_255/0.2)]" />
          <Skeleton width="wide" className="mt-3 h-8 bg-[rgb(255_255_255/0.2)]" />
          <div className="qbank-hero__actions">
            <Skeleton className="h-11 w-36 bg-[rgb(255_255_255/0.2)]" />
            <Skeleton className="h-11 w-44 bg-[rgb(255_255_255/0.2)]" />
          </div>
        </div>
      </section>
      <div className="qbank-stats">
        {[0, 1, 2].map((tile) => (
          <Skeleton key={tile} className="h-20" />
        ))}
      </div>
      <div className="qbank-layout">
        <div className="qbank-main">
          <Skeleton className="h-11 w-56" />
          <Skeleton className="h-20" />
          {[0, 1, 2].map((row) => (
            <div key={row} className="qrow">
              <Skeleton width="narrow" className="h-6" />
              <Skeleton width="full" className="h-5" />
              <Skeleton width="wide" className="h-16" />
            </div>
          ))}
        </div>
        <div className="qbank-cats p-3">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="mt-2 h-8" />
          ))}
        </div>
      </div>
      <span className="sr-only">{copy.common.loading}</span>
    </>
  );
}
