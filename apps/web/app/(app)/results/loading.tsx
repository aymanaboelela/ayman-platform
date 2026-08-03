import { Skeleton } from '@ayman/ui';

/**
 * A Server Component, so this skeleton ships inside the SSR'd HTML. It mirrors
 * the settled page's regions in order — header, four stat tiles, the trend
 * chart, then the per-quiz list — so nothing jumps when the one authenticated
 * fetch resolves. Bar widths vary (full/wide/narrow) rather than being
 * uniform, the biggest "cheap skeleton" tell.
 *
 * The chart block is drawn even though the real page hides it for a student
 * with fewer than two attempts. Guessing wrong costs 160px of settling on one
 * visit; the alternative is a skeleton that omits the largest element on the
 * page for everyone, which is the worse trade in both directions.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
      <div className="mb-6 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-line bg-surface-2 p-4">
            <Skeleton width="narrow" className="h-7" />
            <Skeleton width={index % 2 === 0 ? 'narrow' : 'wide'} className="h-4" />
          </div>
        ))}
      </div>

      <div className="mb-8 space-y-4 rounded-lg border border-line bg-surface-2 p-5">
        <Skeleton width="narrow" className="h-5" />
        <Skeleton width="full" className="h-40" />
      </div>

      <div className="space-y-4">
        <Skeleton width="narrow" className="h-5" />
        <div className="overflow-hidden rounded-lg border border-line bg-surface-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-4 border-b border-line-subtle p-5 last:border-b-0"
            >
              <Skeleton width={index % 2 === 0 ? 'wide' : 'narrow'} className="h-4" />
              <Skeleton width="narrow" className="h-8" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
