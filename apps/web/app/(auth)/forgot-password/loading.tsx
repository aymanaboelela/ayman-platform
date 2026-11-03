import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/**
 * The phone step's proportions — heading, one field, the button, the way back
 * — so nothing resizes when the form hydrates.
 */
export default function Loading() {
  return (
    <>
      <RouteLoadingWatchdog />
      <div className="space-y-2">
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Skeleton width="narrow" className="h-3" />
          <Skeleton width="full" className="h-10" />
        </div>
        <Skeleton width="full" className="h-10" />
        <Skeleton width="narrow" className="mx-auto h-3" />
      </div>
    </>
  );
}
