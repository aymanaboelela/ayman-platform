import { Skeleton } from '@ayman/ui';

/** Mirrors the year listing: centred title, filter pills, then the card grid
 *  inside its panel. A Server Component, so it ships in the SSR'd HTML. */
export default function Loading() {
  return (
    <main>
      <header className="page-head site-shell">
        <Skeleton width="narrow" className="mx-auto h-9" />
      </header>

      <div className="site-shell">
        <div className="filters">
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-36 rounded-full" />
        </div>

        <div className="catalog-panel">
          <div className="courses__grid">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="site-card p-3">
                <Skeleton className="mb-4 aspect-video w-full rounded-xl" />
                <Skeleton width={i === 1 ? 'narrow' : 'wide'} className="mb-3 h-5" />
                <Skeleton width="full" className="mb-2 h-3" />
                <Skeleton width="narrow" className="mb-4 h-3" />
                <Skeleton className="h-11 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
