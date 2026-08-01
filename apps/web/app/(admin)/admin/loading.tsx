import { Card, CardBody, Skeleton } from '@ayman/ui';

/**
 * A Server Component skeleton — no client JS needed to show it, it streams
 * before the session lookup and the page's own data resolve. Geometry
 * mirrors the real overview: a heading-height bar, a lead-line bar, then a
 * grid of card-shaped placeholders. Varied widths (100/85/60%) read as
 * "loading" rather than "broken"; a uniform block reads as the latter.
 */
export default function AdminOverviewLoading() {
  return (
    <>
      <Skeleton width="narrow" className="h-8" />
      <Skeleton width="wide" className="mt-3 h-4" />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-line bg-surface-2 p-4">
            <Skeleton width="narrow" className="h-7" />
            <Skeleton width="wide" className="mt-2 h-4" />
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardBody className="flex items-center gap-3">
              <Skeleton width="narrow" className="size-9 shrink-0 rounded-md" />
              <Skeleton width={i % 3 === 0 ? 'full' : i % 3 === 1 ? 'wide' : 'narrow'} />
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
