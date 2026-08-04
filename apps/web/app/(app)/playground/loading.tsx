import { Skeleton } from '@ayman/ui';

/** Mirrors the two-panel split so the layout does not jump when it hydrates. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-6 py-10 md:py-12">
      <div className="mb-6 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div className="panel overflow-hidden" key={index}>
            <Skeleton className="h-9 rounded-none" />
            <div className="p-4">
              <Skeleton className="h-[19rem]" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
