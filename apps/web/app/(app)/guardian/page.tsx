import { redirect } from 'next/navigation';
import { copy } from '@ayman/contracts/copy';
import { ClipboardCheck, FileCheck2, TrendingUp } from 'lucide-react';
import { formatCopy } from '@ayman/contracts/format';
import { Badge } from '@ayman/ui/components/badge';
import { Card, CardBody } from '@ayman/ui';
import { StatTile } from '@/components/dashboard/stat-tile';
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

  const { student, dashboard, report } = view;
  const { homework, quizzes, papers } = report;

  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-6 py-10">
      <header className="mb-6">
        <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">{c.eyebrow}</p>
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{student.name}</h1>
      </header>

      {/*
        تلات أرقام فوق كل حاجة — دي اللي الأب فاتح الصفحة عشانها.

        «سلّم ٣ من ٥» مش «سلّم ٣»: رقم من غير مقام مالوش معنى لحد مش عارف
        الكورس فيه كام واجب. و«لسه ماامتحنش» مكان المتوسط قبل أول ورقة، لأن
        «٠٪» بيقرا «امتحن وجاب صفر» — وهي جملة تانية خالص في بيت.
      */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile
          icon={<ClipboardCheck className="size-4" aria-hidden="true" />}
          value={`${homework.submitted} ${c.of} ${homework.published}`}
          label={c.homeworkLabel}
          note={homework.needsWork > 0 ? formatCopy(c.needsWork, { n: homework.needsWork }) : undefined}
        />
        <StatTile
          icon={<FileCheck2 className="size-4" aria-hidden="true" />}
          value={quizzes.sat}
          label={c.quizzesLabel}
          note={quizzes.sat > 0 ? formatCopy(c.passedOf, { passed: quizzes.passed }) : undefined}
        />
        <StatTile
          icon={<TrendingUp className="size-4" aria-hidden="true" />}
          value={quizzes.averagePercent === null ? c.noAverage : `${quizzes.averagePercent}%`}
          label={c.averageLabel}
        />
      </div>

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

      {/* الورق — الأحدث الأول، وكل سطر بيقول عدّى ولا لأ.
          الأرقام فوق بتقول «كام»، ودي بتقول «فين» — والأب اللي شايف متوسط
          واطي محتاج يعرف ده جاي من أنهي ورقة، مش يسأل ابنه. */}
      {papers.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-[length:var(--fs-title-4)] font-medium text-fg">
            {c.papersTitle}
          </h2>
          <ul className="space-y-2">
            {papers.map((item) => (
              <li
                key={item.attemptId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line-subtle bg-surface-2 p-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[length:var(--fs-text-sm)] text-fg">
                    {item.title}
                  </span>
                  <span className="block truncate text-[length:var(--fs-text-xs)] text-fg-muted">
                    {item.courseTitle}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {/* الدرجة `ltr` جوّه سطر عربي — «٩٤%» بتتقلب من غيرها. */}
                  <span dir="ltr" className="mono text-[length:var(--fs-text-sm)] text-fg">
                    {item.scorePercent}%
                  </span>
                  <Badge tone={item.passed ? 'accent' : 'neutral'}>
                    {item.passed ? c.passed : c.failed}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
