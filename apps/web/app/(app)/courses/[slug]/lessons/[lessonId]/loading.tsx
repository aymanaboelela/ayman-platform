import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * A Server Component, so the skeleton is in the SSR'd HTML. The geometry is
 * derived from the real layout — same grid, same aspect-video box — so the
 * swap is invisible and contributes nothing to CLS. Bar widths are varied
 * (full/wide/narrow) rather than uniform — the biggest "cheap" skeleton tell.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-10">
      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-7" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <div className="aspect-video w-full rounded-lg border border-line bg-surface-2" />
          <Skeleton width="full" />
          <Skeleton width="wide" />
          <Skeleton width="narrow" />
        </div>
        <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-4">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton
              key={index}
              width={index % 3 === 0 ? 'full' : index % 3 === 1 ? 'wide' : 'narrow'}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
