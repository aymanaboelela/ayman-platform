import { Skeleton } from '@ayman/ui/components/skeleton';
import { copy } from '@ayman/contracts/copy/admin';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/**
 * The overview's footprint while its reads are in flight — the title, the
 * search row and two quiz cards at their real height, so nothing jumps when
 * the data lands. Same reasoning as `/admin/homework`'s: `(admin)` is exempt
 * from `loading-coverage.test.ts`, but this is a `no-store` round trip on
 * every visit.
 */
export default function Loading() {
  return (
    <>
      <RouteLoadingWatchdog />
      <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{copy.quizAdmin.attemptsTitle}</h1>
      <div className="mt-4 flex flex-wrap items-end gap-2" aria-hidden="true">
        <Skeleton className="h-10 min-w-0 flex-1 basis-72 rounded-full" />
        <Skeleton className="h-9 w-40 rounded-lg max-sm:w-full" />
      </div>
      <div className="mt-6 flex items-center justify-between border-b border-line pb-2.5" aria-hidden="true">
        <Skeleton className="h-7 w-56 rounded-md" />
        <Skeleton className="h-7 w-28 rounded-full" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2.5 xl:grid-cols-2" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[6.5rem] rounded-xl" />
        ))}
      </div>
    </>
  );
}
