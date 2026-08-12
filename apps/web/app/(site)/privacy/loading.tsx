import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * `/privacy` genuinely suspends — it reads `getPublicSettingsOrDefaults()` for
 * the contact address — so this is on the real path, not a formality.
 *
 * Built inline from `@ayman/ui`'s primitive rather than from a shared
 * `<LegalSkeleton>`: `loading-coverage.test.ts` asserts every skeleton is built
 * from the shared primitives directly, so that the geometry stays visibly next
 * to the bars it is claiming parity with. Nine sections, matching `page.tsx`.
 *
 * The primitive arrives via the `@ayman/ui/components/skeleton` subpath rather
 * than the barrel — see `app/loading.tsx` for the seven Radix client modules
 * that buys back on every route.
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
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="legal__section">
                {/* Widths vary rather than being uniform — a column of
                    identical bars is the cheap-skeleton tell. */}
                <Skeleton width={i % 2 === 0 ? 'narrow' : 'wide'} className="mb-4 h-6" />
                <Skeleton width="full" className="mb-2 h-4" />
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
