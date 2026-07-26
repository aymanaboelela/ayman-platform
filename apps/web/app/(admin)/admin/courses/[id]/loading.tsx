import { Card, CardBody, Skeleton } from '@ayman/ui';

/** Required by `cacheComponents` — see `../loading.tsx` for the full rationale. */
export default function Loading() {
  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton width="wide" className="h-7" />
          <Skeleton width="narrow" className="h-4" />
        </div>
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="max-w-[var(--w-prose)] space-y-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton width="narrow" className="h-4" />
            <Skeleton width="full" className="h-10" />
          </div>
        ))}
      </div>
      <Card>
        <CardBody className="space-y-3">
          <Skeleton width="narrow" className="h-5" />
          <Skeleton width="full" className="h-10" />
        </CardBody>
      </Card>
    </div>
  );
}
