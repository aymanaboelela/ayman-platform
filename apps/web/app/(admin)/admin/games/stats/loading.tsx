import { Skeleton } from '@ayman/ui/components/skeleton';
import { copy } from '@ayman/contracts/copy/admin';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** نفس شكل «إحصائيات الألعاب»: العنوان، التبويبات، الفترة، أربع أرقام، الرسمتين، وكروت الألعاب. */
export default function GameStatsLoading() {
  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <RouteLoadingWatchdog />
      <Skeleton width="narrow" className="h-8" />
      <Skeleton width="wide" className="mt-2 h-4" />
      <Skeleton width="full" className="mt-4 h-9" />
      <Skeleton width="narrow" className="mt-4 h-8 max-w-96" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-line bg-surface-2 p-4">
            <Skeleton width="narrow" className="h-4" />
            <Skeleton width="wide" className="mt-2 h-7" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface-2 p-5 lg:col-span-2">
          <Skeleton width="narrow" className="h-5" />
          <Skeleton width="full" className="mt-4 h-44" />
        </div>
        <div className="rounded-lg border border-line bg-surface-2 p-5">
          <Skeleton width="narrow" className="h-5" />
          <Skeleton width="full" className="mt-4 h-44" />
        </div>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-line bg-surface-2 p-4">
            <Skeleton width="wide" className="h-5" />
            <Skeleton width="full" className="mt-3 h-16" />
          </div>
        ))}
      </div>
      <span className="sr-only">{copy.common.loading}</span>
    </div>
  );
}
