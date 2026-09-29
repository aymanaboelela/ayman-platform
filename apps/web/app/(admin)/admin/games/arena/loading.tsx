import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** نفس شكل «ساحة التحدي» في الأدمن: العنوان، التبويبات، تلات أرقام، وقايمتين. */
export default function AdminArenaLoading() {
  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <RouteLoadingWatchdog />
      <Skeleton width="narrow" className="h-8" />
      <Skeleton width="wide" className="mt-2 h-4" />
      <Skeleton width="full" className="mt-4 h-9" />
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-line bg-surface-2 p-4">
            <Skeleton width="narrow" className="h-4" />
            <Skeleton width="wide" className="mt-2 h-7" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface-2 p-4 lg:col-span-2">
          <Skeleton width="narrow" className="h-5" />
          <Skeleton width="full" className="mt-4 h-40" />
        </div>
        <div className="rounded-lg border border-line bg-surface-2 p-4">
          <Skeleton width="narrow" className="h-5" />
          <Skeleton width="full" className="mt-4 h-40" />
        </div>
      </div>
    </div>
  );
}
