import { Skeleton } from '@ayman/ui';

/** Required by `cacheComponents` — see `../loading.tsx` for the full rationale. */
export default function Loading() {
  return (
    <>
      <Skeleton width="narrow" className="mb-6 h-8" />
      <div className="max-w-[var(--w-prose)] space-y-5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton width="narrow" className="h-4" />
            <Skeleton width="full" className="h-10" />
          </div>
        ))}
      </div>
    </>
  );
}
