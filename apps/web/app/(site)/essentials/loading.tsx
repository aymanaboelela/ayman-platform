import { Skeleton } from '@ayman/ui/components/skeleton';

/** Mirrors the essentials page: tinted hero band, then the term-card grid.
 *  A Server Component, so it ships in the SSR'd HTML. */
export default function Loading() {
  return (
    <main>
      <section className="essentials-hero">
        <div className="site-shell">
          <Skeleton className="mx-auto mb-4 h-7 w-32 rounded-full" />
          <Skeleton width="narrow" className="mx-auto mb-4 h-10" />
          <Skeleton width="wide" className="mx-auto mb-8 h-4" />
          <Skeleton className="mx-auto h-11 w-36 rounded-full" />
        </div>
      </section>

      <section className="site-section">
        <div className="site-shell">
          <Skeleton width="narrow" className="mx-auto mb-3 h-8" />
          <Skeleton width="wide" className="mx-auto h-4" />
          <div className="terms__grid">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="term">
                <Skeleton width="narrow" className="mb-4 h-3" />
                <Skeleton width={i % 3 === 1 ? 'narrow' : 'wide'} className="mb-3 h-5" />
                <Skeleton width="full" className="mb-2 h-3" />
                <Skeleton width="narrow" className="h-3" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
