import { Skeleton } from '@ayman/ui';

/**
 * Auth cards are narrow and fixed-height, so this skeleton mirrors the real
 * form's proportions closely — two inputs, a submit, then the provider
 * buttons below the divider. A generic block here would visibly resize on
 * hydration.
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
        {Array.from({ length: 2 }, (_, index) => (
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
