import { Skeleton } from '@ayman/ui';

/** Mirrors the real page: header, then the two selects that are always shown. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 md:py-12">
      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>

      <div className="space-y-5">
        {Array.from({ length: 2 }, (_, index) => (
          <div className="space-y-2" key={index}>
            <Skeleton width="narrow" className="h-3" />
            <Skeleton className="h-11 rounded-sm" />
          </div>
        ))}
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton width="narrow" className="h-10 rounded-sm" />
      </div>
    </main>
  );
}
