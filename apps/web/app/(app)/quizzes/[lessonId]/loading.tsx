import { Skeleton } from '@ayman/ui';

/**
 * A Server Component, so the skeleton is in the SSR'd HTML — the 180ms
 * shimmer delay is `Skeleton`'s own (see `packages/ui/src/tokens/motion.css`),
 * which is what stops a fast load from ever showing this at all. Bar widths
 * vary (100%/85%/60%) rather than uniform, the single biggest difference
 * between a skeleton that reads as designed and one that reads as cheap.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[var(--w-prose)] px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Skeleton width="narrow" className="h-6 rounded-full" />
        <Skeleton width="wide" className="h-7" />
      </div>
      <Skeleton width="full" className="mb-6 h-4" />
      <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg border border-line bg-surface-2 p-4 sm:grid-cols-3">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} width={index % 3 === 0 ? 'full' : index % 3 === 1 ? 'wide' : 'narrow'} />
        ))}
      </div>
      <Skeleton width="narrow" className="h-10 rounded-sm" />
    </main>
  );
}
