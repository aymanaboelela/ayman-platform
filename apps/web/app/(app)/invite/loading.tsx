import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** The colour band, then the share card and the stat tiles — the page's own shapes. */
export default function InviteLoading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <RouteLoadingWatchdog />
      <Skeleton width="full" className="h-48 rounded-lg" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-6">
          <Skeleton width="full" className="h-40 rounded-lg" />
          <Skeleton width="full" className="h-36 rounded-lg" />
        </div>
        <Skeleton width="full" className="h-72 rounded-lg" />
      </div>
    </main>
  );
}
