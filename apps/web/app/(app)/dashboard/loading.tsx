import { Skeleton } from '@ayman/ui';

/**
 * A Server Component, so this skeleton ships inside the SSR'd HTML. It mirrors
 * the real page's four regions in order — header, stat strip, continue-watching
 * card, then the courses/rail split — so the layout does not jump when the two
 * authenticated fetches resolve. Bar widths are varied (full/wide/narrow)
 * rather than uniform, the biggest "cheap skeleton" tell.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-6 py-10 md:py-12">
      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-line bg-surface-2 p-4">
            <Skeleton width="narrow" className="h-8" />
            <Skeleton width={index % 2 === 0 ? 'narrow' : 'wide'} className="h-7" />
            <Skeleton width="wide" className="h-3" />
          </div>
        ))}
      </div>

      <div className="mb-8 space-y-4 rounded-lg border border-line bg-surface-2 p-5 sm:p-6">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-6" />
        <Skeleton width="full" className="h-1" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-4 rounded-lg border border-line bg-surface-2 p-5">
              <Skeleton width={index % 2 === 0 ? 'wide' : 'narrow'} className="h-5" />
              <Skeleton width="full" className="h-1" />
              <Skeleton width="narrow" className="h-3" />
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <Skeleton width="narrow" className="h-5" />
          <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} width={index % 2 === 0 ? 'full' : 'wide'} className="h-4" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
