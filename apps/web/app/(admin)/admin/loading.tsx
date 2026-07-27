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
      <Skeleton width="narrow" className="h-24" />
      <Skeleton width="wide" className="mt-12 h-16" />

      <div className="mt-24 grid grid-cols-1 gap-16 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardBody className="flex items-center gap-12">
              <Skeleton width="narrow" className="size-5 shrink-0 rounded-full" />
              <Skeleton width={i % 3 === 0 ? 'full' : i % 3 === 1 ? 'wide' : 'narrow'} />
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
