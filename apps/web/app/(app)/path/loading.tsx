import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/**
 * A Server Component, so this ships inside the SSR'd HTML. Mirrors the real
 * page's regions in order — header, summary card, then the rail/map split — so
 * the layout does not jump when the authenticated fetch resolves. Bar widths
 * vary rather than being uniform, the biggest "cheap skeleton" tell.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-6 py-10 md:py-12">
      <RouteLoadingWatchdog />
      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>

      {/* الهيرو بلونه الحقيقي مش رمادي — شريط رمادي بيتبدّل بجريدينت أزرق
          بيعمل «فلاش» أول ما الصفحة تحمّل. */}
      <div className="mb-8 h-72 rounded-lg bg-[color-mix(in_oklab,var(--viz-5)_60%,var(--viz-3))] opacity-70 md:h-60" />

      <div className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="space-y-2 rounded-lg border border-line bg-surface-2 p-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} width={index % 2 === 0 ? 'wide' : 'narrow'} className="h-5" />
          ))}
        </div>

        <div className="space-y-6">
          <Skeleton width="narrow" className="h-6" />
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-center gap-4">
              <Skeleton className="size-11 shrink-0 rounded-full" />
              <Skeleton width={index % 3 === 0 ? 'wide' : 'narrow'} className="h-5" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
