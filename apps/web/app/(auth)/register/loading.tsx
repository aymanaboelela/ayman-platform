import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * The login skeleton plus two fields (name and password confirmation), so the
 * column does not visibly grow when the real form hydrates.
 *
 * A Server Component, so it ships inside the SSR'd HTML.
 */
export default function Loading() {
  return (
    <>
      <div className="space-y-2">
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>
      <div className="space-y-5">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton width="narrow" className="h-3" />
            <Skeleton width="full" className="h-10" />
          </div>
        ))}
        <Skeleton width="full" className="h-10" />
        <Skeleton width="narrow" className="mx-auto h-3" />
        <Skeleton width="full" className="h-10" />
      </div>
    </>
  );
}
