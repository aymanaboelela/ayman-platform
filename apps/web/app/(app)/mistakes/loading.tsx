import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

export default function MistakesLoading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-8">
      <RouteLoadingWatchdog />
      <Skeleton width="narrow" className="h-6 max-w-40" />
      <Skeleton width="wide" className="mt-3 h-4" />
      <div className="mt-6 grid gap-3">
        <Skeleton width="full" className="h-20 rounded-lg" />
        <Skeleton width="full" className="h-20 rounded-lg" />
        <Skeleton width="full" className="h-20 rounded-lg" />
      </div>
    </main>
  );
}
