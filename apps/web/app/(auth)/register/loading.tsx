import { Skeleton } from '@ayman/ui';

/**
 * Same shape as the login skeleton but with a third field (password
 * confirmation), so the card does not visibly grow when the real form
 * hydrates.
 *
 * A Server Component, so it ships inside the SSR'd HTML.
 */
export default function Loading() {
  return (
    <div className="w-full space-y-6 rounded-lg border border-line bg-surface-2 p-6">
      <div className="space-y-2">
        <Skeleton width="wide" className="h-7" />
        <Skeleton width="narrow" className="h-3" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton width="narrow" className="h-3" />
            <Skeleton width="full" className="h-10" />
          </div>
        ))}
      </div>
      <Skeleton width="full" className="h-10" />
      <Skeleton width="narrow" className="mx-auto h-3" />
      <Skeleton width="full" className="h-10" />
    </div>
  );
}
