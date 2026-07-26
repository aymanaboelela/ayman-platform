import { Card, CardBody, CardHeader, Skeleton } from '@ayman/ui';

/**
 * A Server Component, so this skeleton ships inside the SSR'd HTML. Also
 * required by `cacheComponents` (`next.config.ts`): the page below awaits an
 * uncached `fetch` to `/api/taxonomy`, and Next 16 requires that kind of
 * access to sit under a `<Suspense>` boundary — a sibling `loading.tsx` is
 * what provides one automatically for the whole route segment.
 */
export default function Loading() {
  return (
    <>
      <div className="mb-8 space-y-3">
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>
      <div className="space-y-6">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton width="narrow" className="h-5" />
            </CardHeader>
            <CardBody className="space-y-4">
              <Skeleton width="full" className="h-10" />
              <Skeleton width="full" className="h-10" />
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
