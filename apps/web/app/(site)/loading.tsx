import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * The landing skeleton. A Server Component, so it ships inside the SSR'd HTML.
 *
 * Geometry matches the real page: a full-viewport hero band with the copy
 * column on the inline-end side, then a tinted section and a card row. Bar
 * widths vary rather than being uniform — the biggest "cheap skeleton" tell.
 */
export default function Loading() {
  return (
    <main>
      <section className="hero">
        <div className="hero__body">
          <div className="hero__copy" style={{ gridColumn: 2, width: '100%' }}>
            <Skeleton width="narrow" className="mb-4 h-3" />
            <Skeleton width="wide" className="mb-3 h-12" />
            <Skeleton width="narrow" className="mb-6 h-12" />
            <Skeleton width="full" className="mb-2 h-4" />
            <Skeleton width="wide" className="mb-8 h-4" />
            <div className="flex gap-3">
              <Skeleton className="h-11 w-36 rounded-full" />
              <Skeleton className="h-11 w-36 rounded-full" />
            </div>
          </div>
        </div>
      </section>

      <section className="site-section site-section--tint">
        <div className="site-shell">
          <Skeleton width="narrow" className="mb-3 h-8" />
          <Skeleton width="wide" className="mb-10 h-4" />
          <div className="courses__grid">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="site-card p-3">
                <Skeleton className="mb-4 aspect-video w-full rounded-xl" />
                <Skeleton width={i === 1 ? 'narrow' : 'wide'} className="mb-3 h-5" />
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
