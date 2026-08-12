import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * A Server Component, so this ships inside the SSR'd HTML. Mirrors the settled
 * page in order — header, then the list — at the same `--w-prose` width, so
 * nothing shifts when the one authenticated read resolves.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-prose)] px-4 py-8 md:px-6 md:py-10">
      <div className="mb-6 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface-2">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="flex items-start gap-3 border-b border-line-subtle p-4 last:border-b-0"
          >
            <Skeleton className="size-8 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton width={index % 2 === 0 ? 'wide' : 'narrow'} className="h-4" />
              <Skeleton width="narrow" className="h-3" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
