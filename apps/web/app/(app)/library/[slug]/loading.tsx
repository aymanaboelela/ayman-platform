import { Skeleton } from '@ayman/ui/components/skeleton';

/** Mirrors the page: back link, header, progress panel, then two outline cards. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-6 py-10 md:py-12">
      <Skeleton width="narrow" className="mb-6 h-4" />

      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>

      <div className="panel mb-8 space-y-3 px-5 py-4">
        <Skeleton width="wide" className="h-5" />
        <Skeleton className="h-2" />
        <Skeleton width="narrow" className="h-10 rounded-sm" />
      </div>

      <Skeleton width="narrow" className="mb-4 h-6" />
      <div className="flex flex-col gap-5">
        {Array.from({ length: 2 }, (_, section) => (
          <div className="panel overflow-hidden" key={section}>
            <div className="border-b border-line bg-surface-2 px-4 py-3">
              <Skeleton width="narrow" className="h-5" />
            </div>
            <div className="divide-y divide-line">
              {Array.from({ length: 3 }, (_, row) => (
                <div className="flex items-center gap-3 px-4 py-3" key={row}>
                  <Skeleton className="size-9 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton width={row % 2 === 0 ? 'wide' : 'narrow'} className="h-4" />
                    <Skeleton width="narrow" className="h-3" />
                  </div>
                  <Skeleton className="h-9 w-20 shrink-0 rounded-sm" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
