import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * A Server Component, so this ships inside the SSR'd HTML.
 *
 * Mirrors the real page's regions in order — `.study-head`, the shipping line,
 * then one shelf of covers beside the basket rail — because the shop's own
 * layout is a two-column grid from `lg` up and a skeleton that draws one column
 * collapses to half the height the moment the catalogue lands.
 *
 * Four covers, not one row: `.books-grid` fills from the inline start at
 * `minmax(min(15rem,100%), 20rem)`, which is three-up on the shell's widened
 * column, so a three-card skeleton is exactly one row and the page still grows
 * when the fourth book arrives.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10">
      <div className="mb-6 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>

      <Skeleton width="narrow" className="mb-6 h-5" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="panel overflow-hidden p-4">
          <Skeleton width="narrow" className="mb-4 h-5" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="panel overflow-hidden" key={index}>
                <Skeleton className="aspect-[3/4] rounded-none" />
                <div className="space-y-3 p-3">
                  <Skeleton width={index % 2 === 0 ? 'wide' : 'narrow'} className="h-5" />
                  <Skeleton width="narrow" className="h-3" />
                  <Skeleton className="h-10 rounded-sm" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel space-y-3 p-4">
          <Skeleton width="narrow" className="h-5" />
          <Skeleton className="h-3" />
          <Skeleton className="h-10 rounded-sm" />
        </div>
      </div>
    </main>
  );
}
