import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/**
 * سيرفر كومبوننت، فبيتشحن جوّه الـHTML — وده كل الفايدة منه.
 *
 * بيرسم نفس مناطق الصفحة بنفس الترتيب: العنوان، وبعده لوحة الدفع. وعلى
 * `--w-app` زي الصفحة نفسها، مش `--w-prose` زي «كل طلباتي» — دي صفحة فيها
 * فورم بعرض السطح، والاتنين لو اختلفوا المحتوى بيقفز لما القراية تخلص.
 *
 * اللوحة كتلة واحدة طويلة مش كروت: اللي جاي `<BookOrderPanel>` على خطوة
 * العنوان مليانة — فورم واحد، مش ليستة.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10">
      <RouteLoadingWatchdog />
      <div className="mb-6 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>

      <div className="space-y-4 rounded-lg border border-line bg-surface-2 p-4">
        <Skeleton width="narrow" className="h-4" />
        <Skeleton className="h-11 w-full rounded-md" />
        <Skeleton width="narrow" className="h-4" />
        <Skeleton className="h-11 w-full rounded-md" />
        <Skeleton width="narrow" className="h-4" />
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-11 w-40 rounded-md" />
      </div>
    </main>
  );
}
