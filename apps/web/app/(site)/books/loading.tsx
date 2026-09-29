import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/**
 * The shop skeleton. A Server Component, so it ships inside the SSR'd HTML
 * rather than waiting on hydration.
 *
 * Geometry matches the real page — a hero with the shipping card beside it,
 * then two shelves, each a coloured head over a grid of book cards whose
 * jackets stand on a stage — because a skeleton whose blocks land
 * somewhere other than the content does not hide the load, it announces it as a
 * jump. The card count per shelf differs between the two for the reason
 * `news/loading.tsx` varies its widths: a perfectly uniform grid is the classic
 * cheap-skeleton tell.
 *
 * The phone basket bar is deliberately absent. It only renders once something
 * is IN the basket, so a placeholder for it would be a promise of a panel that
 * will not appear. The desktop rail is not: it is there, empty, from the first
 * paint.
 */
export default function Loading() {
  return (
    <div aria-hidden="true" className="books-page">
      <RouteLoadingWatchdog />
      <section className="books-hero">
        <div className="site-shell books-hero__inner">
          <div>
            <Skeleton width="narrow" className="mb-4 h-6" />
            <Skeleton width="wide" className="mb-3 h-12" />
            <Skeleton width="full" className="h-4" />
          </div>
          {/* The shipping card: a headline beside its icon, then three zone rows. */}
          <div className="books-ship">
            <div className="books-ship__head">
              <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton width="full" className="h-4" />
                <Skeleton width="narrow" className="h-3" />
              </div>
            </div>
            <div className="books-ship__zones">
              {[0, 1, 2].map((zone) => (
                <Skeleton key={zone} className="h-11 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="site-shell books-shelves">
        <div className="books-layout">
          <div className="books-shelves">
            {[4, 3].map((count, shelf) => (
              <div key={shelf} className="books-shelf">
                <div className="books-shelf__head">
                  <Skeleton className="h-11 w-11 rounded-xl" />
                  <Skeleton width="narrow" className="h-5" />
                </div>
                <div className="books-shelf__body">
                  <div>
                    <Skeleton width="narrow" className="mb-4 h-4" />
                    <div className="books-grid">
                      {Array.from({ length: count }, (_, i) => (
                        <div key={i} className="book-card">
                          <div className="book-card__art">
                            <Skeleton className="book-card__jacket" />
                          </div>
                          <div className="book-card__body">
                            <Skeleton width="wide" className="h-5" />
                            <Skeleton width="narrow" className="h-3" />
                            <Skeleton width="narrow" className="mt-2 h-6" />
                            <Skeleton width="full" className="h-10 rounded-xl" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* The desktop rail, in its empty state — it is on the page from the
              first paint whether or not anything is in the basket (only the
              PHONE bar waits for a first book, and it has no placeholder
              here for that reason). Hidden below 64rem by the rail's own rule. */}
          <div className="books-cart">
            <div className="books-cart__head">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton width="narrow" className="h-5" />
            </div>
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
