import { redirect } from 'next/navigation';
import { copy } from '@ayman/contracts/copy';
import { Card, CardBody } from '@ayman/ui';
import { apiGetAuthed } from '@/lib/api-server';
import { GuardianViewSchema } from '@/lib/guardian';

const c = copy.guardian;

export const metadata = { title: c.title };

/**
 * صفحة ولي الأمر — «ابني وصل لفين».
 *
 * ## الأرقام هي نفسها اللي الابن بيشوفها
 *
 * بتتقرا من `DashboardService.forUser` — نفس الحساب بالحرف. تجميع تاني
 * بنفس المعنى كان هيخلّي الأب يشوف رقم والابن يشوف رقم تاني، والاتنين
 * مقتنعين، ومفيش حد يعرف مين الصح.
 *
 * ## ومفيش أي حاجة تتعمل من هنا
 *
 * صفحة قراية بحتة: مفيش زرار بيكتب، ولا لينك بيوصّل لحتة بتكتب. جلسة ولي
 * الأمر بتقول «أنهي طالب» وبس، والـAPI مابيقبلهاش على أي راوت كتابة.
 */
export default async function GuardianPage() {
  const view = await apiGetAuthed('/api/guardian/me', GuardianViewSchema).catch(() => null);
  // الكوكي راحت أو خلصت بين فحص البروكسي والقراية دي. الدخول تاني هو
  // الإجابة الوحيدة، وصفحة خطأ هنا كانت هتسيب الأب في طريق مقفول.
  if (!view) redirect('/login');

  const { student, dashboard } = view;

  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-6 py-10">
      <header className="mb-6">
        <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">{c.eyebrow}</p>
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{student.name}</h1>
      </header>

      {dashboard.enrolledCourses.length === 0 ? (
        <p className="text-fg-muted">{c.noCourses}</p>
      ) : (
        <div className="space-y-3">
          {dashboard.enrolledCourses.map((course) => (
            <Card key={course.id}>
              <CardBody>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[length:var(--fs-text-base)] font-medium text-fg">
                    {course.title}
                  </p>
                  <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
                    {/* «٦ من ١١» — نفس الأرقام اللي على شاشة الابن، بعد ما
                        بقت تعدّ اللي هو دافع فيه بس. */}
                    {course.completedLessons} {c.of} {course.totalLessons}
                  </p>
                </div>

                <div
                  aria-hidden="true"
                  className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"
                >
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ inlineSize: `${Math.min(Math.max(course.progressPercent, 0), 100)}%` }}
                  />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
