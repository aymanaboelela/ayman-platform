import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * A Server Component skeleton, required by `cacheComponents`: the page below
 * awaits an uncached, cookie-forwarding `fetch` to `/api/admin/courses` (it
 * must never be cached — a stale admin list is how an editor republishes the
 * same course twice), and Next 16 requires that kind of access to sit under
 * a `<Suspense>` boundary. A sibling `loading.tsx` provides one automatically
 * for the whole route segment.
 *
 * It mirrors the GRID the page renders — same columns, same gap, same 16/9
 * cover box — because a skeleton in a different shape from the thing it stands
 * in for is a layout shift with extra steps.
 */
export default function Loading() {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton width="narrow" className="h-8 max-w-64" />
          <Skeleton width="wide" className="h-4 max-w-[var(--w-prose)]" />
        </div>
        <Skeleton width="narrow" className="h-10 w-32 shrink-0" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="panel overflow-hidden">
            <Skeleton width="full" className="aspect-[16/9] h-auto rounded-none" />
            <div className="space-y-3 p-4">
              <Skeleton width="wide" className="h-5" />
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-24" />
              </div>
              <Skeleton width="narrow" className="h-3" />
              <Skeleton width="wide" className="h-3" />
              <Skeleton className="h-8" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
