import { Skeleton } from '@ayman/ui/components/skeleton';

/** The settled page's regions in order — the hero band, the form card beside
 *  the steps column, then the history — so nothing jumps when the one authed
 *  read resolves. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <div className="h-56 rounded-lg bg-surface-3 md:h-64" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-4 rounded-lg border border-line bg-surface-2 p-6">
          <Skeleton width="wide" className="h-5" />
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} width="full" className="h-16" />
            ))}
          </div>
          <Skeleton width="full" className="h-12" />
        </div>
        <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-5">
          <Skeleton width="narrow" className="h-5" />
          <Skeleton width="full" className="h-4" />
          <Skeleton width="wide" className="h-4" />
          <Skeleton width="full" className="h-4" />
        </div>
      </div>
      <div className="mt-10 space-y-3">
        <Skeleton width="narrow" className="h-6" />
        <Skeleton width="full" className="h-28" />
      </div>
    </main>
  );
}
