import { Skeleton } from '@ayman/ui';

/**
 * `/terms` is fully static and will rarely show this, but every route needs
 * one (`loading-coverage.test.ts`) and the two legal pages must not flash
 * differently when a reader moves between them. Six sections, matching
 * `page.tsx`.
 */
export default function Loading() {
  return (
    <main>
      <header className="page-head">
        <div className="site-shell">
          <Skeleton width="narrow" className="mx-auto mb-4 h-9" />
          <Skeleton width="wide" className="mx-auto mb-3 h-4" />
          <Skeleton className="mx-auto h-3 w-40" />
        </div>
      </header>

      <div className="site-section">
        <div className="site-shell">
          <div className="legal">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="legal__section">
                <Skeleton width={i % 2 === 0 ? 'narrow' : 'wide'} className="mb-4 h-6" />
                <Skeleton width="full" className="mb-2 h-4" />
                <Skeleton width={i % 3 === 0 ? 'narrow' : 'wide'} className="h-4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
