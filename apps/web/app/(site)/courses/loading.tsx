import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * A Server Component, so this ships inside the SSR'd HTML. Bar widths vary
 * (100% / 85% / 60% via `Skeleton`'s `width` prop) — uniform bars are the
 * single biggest "cheap skeleton" tell.
 *
 * Geometry follows `CourseCard`: a 16/9 thumb, title, three meta rows, then a
 * full-width outline CTA.
 */
export default function Loading() {
  return (
    <main>
      <header className="page-head site-shell">
        <Skeleton width="narrow" className="mx-auto mb-3 h-9" />
        <Skeleton width="wide" className="mx-auto h-4" />
      </header>

      <div className="site-shell">
        <div className="catalog-panel">
          <div className="courses__grid">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="site-card p-3">
                <Skeleton className="mb-4 aspect-video w-full rounded-xl" />
                <Skeleton width={i % 2 === 1 ? 'narrow' : 'wide'} className="mb-3 h-5" />
                <Skeleton width="full" className="mb-2 h-3" />
                <Skeleton width="wide" className="mb-2 h-3" />
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
