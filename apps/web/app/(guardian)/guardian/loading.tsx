import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';
import '@/components/guardian/guardian.css';

/**
 * Server Component، فالهيكل ده بيوصل جوّه الـHTML الأولاني.
 *
 * بيطابق مناطق الصفحة بالترتيب وبنفس المقاسات — الهيرو الملوّن، الأربع
 * أرقام، كارت «محتاج متابعة»، وكارتين كورسات — عشان اللاي‌أوت مايتنطّش لما
 * القراية توصل. الهيرو بنفس الجريدينت (بس من غير رسمة)، لأن مستطيل رمادي
 * مكانه كان هيخلّي أول لحظة في الصفحة شكلها صفحة تانية.
 */
export default function Loading() {
  return (
    <main className="gd" aria-busy="true">
      <RouteLoadingWatchdog />
      <div className="gd-hero gd-hero--skeleton" aria-hidden="true">
        <div className="gd-hero__body">
          <span className="gd-skel gd-skel--pill" />
          <span className="gd-skel gd-skel--name" />
          <span className="gd-skel gd-skel--line" />
          <span className="gd-skel gd-skel--line gd-skel--short" />
        </div>
      </div>

      <ul className="gd-stats" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <li key={index} className="gd-stat">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton width="narrow" className="h-7" />
            <Skeleton width="wide" className="h-3" />
          </li>
        ))}
      </ul>

      <div className="gd-attention" aria-hidden="true">
        <Skeleton width="narrow" className="h-5" />
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      </div>

      <div className="gd-section" aria-hidden="true">
        <Skeleton width="narrow" className="h-5" />
        <ul className="gd-courses">
          {[0, 1].map((index) => (
            <li key={index} className="gd-course">
              <Skeleton className="gd-course__art" />
              <div className="gd-course__main space-y-2">
                <Skeleton width="wide" className="h-4" />
                <Skeleton width="narrow" className="h-3" />
              </div>
              <Skeleton className="size-16 rounded-full" />
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
