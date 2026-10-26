import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/** The hero band, then a row of certificate tiles — the page's own two shapes. */
export default function CertificatesLoading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-8">
      <RouteLoadingWatchdog />
      <Skeleton width="full" className="h-28 rounded-lg" />
      <Skeleton width="narrow" className="mt-8 h-5 max-w-32" />
      <div className="certs-grid mt-3">
        <Skeleton width="full" className="h-56 rounded-lg" />
        <Skeleton width="full" className="h-56 rounded-lg" />
        <Skeleton width="full" className="h-56 rounded-lg" />
      </div>
    </main>
  );
}
