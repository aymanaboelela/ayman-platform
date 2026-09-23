import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * Server Component، فالهيكل ده بيوصل جوّه الـHTML الأولاني.
 *
 * بيطابق مناطق الصفحة بالترتيب — سطر صغير فوق الاسم، الاسم، وتلات كروت
 * كورسات — عشان اللاي‌أوت ما ينطّش لما القراية توصل.
 *
 * وتلاتة مش واحد: الأب عنده ابن مشترك في كورس أو اتنين أو تلاتة، وهيكل صف
 * واحد تحت صفحة بتملا تلاتة بيقصّر الصفحة في اللحظة اللي البيانات بتنزل
 * فيها.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-6 py-10">
      <div className="mb-6 space-y-2">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
      </div>

      <div className="space-y-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-md border border-line-subtle p-4">
            <Skeleton width="wide" className="h-4" />
            <Skeleton className="mt-3 h-2" />
          </div>
        ))}
      </div>
    </main>
  );
}
