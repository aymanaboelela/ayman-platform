import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** نفس شكل اللوبي: الهيرو الغامق، كارت الكورسات وزرار البداية، والقواعد. */
export default function ArenaLoading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-8">
      <RouteLoadingWatchdog />
      <div className="min-h-[18rem] rounded-lg bg-[var(--ink)] p-5">
        <Skeleton width="narrow" className="h-6 max-w-40 opacity-30" />
        <Skeleton width="wide" className="mt-6 h-9 max-w-72 opacity-30" />
        <Skeleton width="wide" className="mt-3 h-4 opacity-30" />
        <div className="mt-8 flex items-center gap-4">
          <Skeleton width="narrow" className="size-16 rounded-full opacity-30" />
          <Skeleton width="wide" className="h-12 max-w-80 opacity-30" />
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface-2 p-5">
          <Skeleton width="narrow" className="h-5" />
          <Skeleton width="full" className="mt-4 h-14" />
          <Skeleton width="full" className="mt-3 h-14" />
          <Skeleton width="full" className="mt-5 h-14" />
        </div>
        <div className="rounded-lg border border-line bg-surface-2 p-5">
          <Skeleton width="narrow" className="h-5" />
          <Skeleton width="full" className="mt-4 h-4" />
          <Skeleton width="full" className="mt-3 h-4" />
          <Skeleton width="wide" className="mt-3 h-4" />
        </div>
      </div>
    </main>
  );
}
