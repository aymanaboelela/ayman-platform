import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * The shop skeleton. A Server Component, so it ships inside the SSR'd HTML
 * rather than waiting on hydration.
 *
 * Geometry matches the real page — a hero, then two shelves, each a coloured
 * head over a grid of 3/4 book cards — because a skeleton whose blocks land
 * somewhere other than the content does not hide the load, it announces it as a
 * jump. The card count per shelf differs between the two for the reason
 * `news/loading.tsx` varies its widths: a perfectly uniform grid is the classic
 * cheap-skeleton tell.
 *
 * The basket rail is deliberately absent. It only renders once something is IN
 * the basket, so a placeholder for it would be a promise of a panel that will
 * not appear.
 */
export default function Loading() {
  return (
    <main className="books-page">
      <section className="books-hero">
        <div className="site-shell">
          <Skeleton width="narrow" className="mb-4 h-6" />
          <Skeleton width="wide" className="mb-3 h-10" />
          <Skeleton width="full" className="mb-5 h-4" />
          <Skeleton width="narrow" className="h-8 rounded-full" />
        </div>
      </section>

      <div className="site-shell books-shelves">
        {[4, 3].map((count, shelf) => (
          <div key={shelf} className="books-shelf">
            <div className="books-shelf__head">
              <Skeleton className="h-9 w-9" />
              <Skeleton width="narrow" className="h-5" />
            </div>
            <div className="books-shelf__body">
              <div>
                <Skeleton width="narrow" className="mb-3 h-4" />
                <div className="books-grid">
                  {Array.from({ length: count }, (_, i) => (
                    <div key={i} className="book-card">
                      <Skeleton className="book-card__art" />
                      <div className="book-card__body">
                        <Skeleton width="wide" className="h-5" />
                        <Skeleton width="narrow" className="h-3" />
                        <Skeleton width="narrow" className="mt-2 h-6" />
                        <Skeleton width="full" className="h-9" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
