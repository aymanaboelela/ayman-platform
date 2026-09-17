import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * A Server Component, so this ships inside the SSR'd HTML — which is the whole
 * point of having one. Mirrors the settled page's regions in order (header,
 * then a stack of order cards) at the same `--w-prose` width, so nothing shifts
 * when the authenticated read resolves.
 *
 * Three cards rather than one: the page's own note explains that it shows every
 * order rather than the two the dashboard does, and a single skeleton card would
 * under-reserve the page for exactly the student this page is for. Bar widths
 * vary rather than being uniform — the biggest "cheap skeleton" tell.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-prose)] px-4 py-8 md:px-6 md:py-10">
      <div className="mb-6 space-y-3">
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-line bg-surface-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-6 w-20 rounded-sm" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton width={index % 2 === 0 ? 'wide' : 'narrow'} className="h-4" />
            <Skeleton width="narrow" className="h-4" />
            <Skeleton width="full" className="h-3" />
          </div>
        ))}
      </div>
    </main>
  );
}
