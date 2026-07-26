import { Skeleton } from '@ayman/ui';

/**
 * A Server Component, so this skeleton ships inside the SSR'd HTML. Bar
 * widths are varied (full/wide/narrow) rather than uniform — the biggest
 * "cheap" skeleton tell.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-10">
      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
      </div>
      <div className="mb-10 space-y-3 rounded-lg border border-line bg-surface-2 p-5">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-6" />
        <Skeleton width="full" className="h-1" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-line bg-surface-2 p-5">
            <Skeleton width={index % 2 === 0 ? 'wide' : 'narrow'} className="h-5" />
            <Skeleton width="full" className="h-1" />
            <Skeleton width="narrow" className="h-3" />
          </div>
        ))}
      </div>
    </main>
  );
}
