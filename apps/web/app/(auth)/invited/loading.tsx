import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** Heading, two lines of explanation, the button and the link back. */
export default function Loading() {
  return (
    <>
      <RouteLoadingWatchdog />
      <div className="space-y-2">
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="full" className="h-4" />
        <Skeleton width="wide" className="h-4" />
      </div>
      <div className="space-y-4">
        <Skeleton width="full" className="h-10" />
        <Skeleton width="narrow" className="mx-auto h-3" />
      </div>
    </>
  );
}
