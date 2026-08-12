import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * The article index skeleton. A Server Component, so it ships inside the SSR'd
 * HTML rather than waiting on hydration.
 *
 * Geometry matches the real page — a page head, then a column of cards each
 * with a title, two excerpt lines and a meta line. Card widths vary because
 * uniform bars are the classic cheap-skeleton tell.
 */
export default function Loading() {
  return (
    <main>
      <header className="page-head site-shell">
        <Skeleton width="narrow" className="mb-4 h-3" />
        <Skeleton width="wide" className="mb-3 h-10" />
        <Skeleton width="full" className="h-4" />
      </header>

      <div className="site-shell">
        <div className="news__grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="site-card p-4">
              <Skeleton width={i % 2 === 0 ? 'wide' : 'narrow'} className="mb-3 h-6" />
              <Skeleton width="full" className="mb-2 h-3" />
              <Skeleton width="wide" className="mb-4 h-3" />
              <Skeleton width="narrow" className="h-3" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
