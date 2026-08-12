import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * The page is fully static, so this is only ever seen for the frame it takes
 * the segment to stream in — but the route-segment rule is per segment, not
 * per fetch, and a missing `loading.tsx` shows the previous page frozen instead.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-6 py-10 md:py-12">
      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="panel space-y-3 p-4" key={index}>
            <Skeleton width="narrow" className="h-3" />
            <Skeleton width={index % 2 === 0 ? 'wide' : 'narrow'} className="h-5" />
            <Skeleton className="h-3" />
          </div>
        ))}
      </div>
    </main>
  );
}
