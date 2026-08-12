import { Card, CardBody } from '@ayman/ui/components/card';
import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * A Server Component skeleton, required by `cacheComponents`: the page below
 * awaits an uncached, cookie-forwarding `fetch` to `/api/admin/courses` (it
 * must never be cached — a stale admin list is how an editor republishes the
 * same course twice), and Next 16 requires that kind of access to sit under
 * a `<Suspense>` boundary. A sibling `loading.tsx` provides one automatically
 * for the whole route segment.
 */
export default function Loading() {
  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Skeleton width="narrow" className="h-8" />
        <Skeleton width="narrow" className="h-10 w-32" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i}>
            <CardBody className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton width="wide" className="h-5" />
                <Skeleton width="narrow" className="h-3" />
              </div>
              <Skeleton className="h-6 w-16 shrink-0" />
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
