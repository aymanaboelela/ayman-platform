import { redirect } from 'next/navigation';
import { guardianCopy as c } from '@ayman/contracts/copy/guardian';
import { formatCopy } from '@ayman/contracts/format';
import { apiGetAuthed } from '@/lib/api-server';
import { GuardianViewSchema } from '@/lib/guardian';
import { attentionItems, firstName } from '@/lib/guardian-view';
import { GuardianHero } from '@/components/guardian/guardian-hero';
import { GuardianStats } from '@/components/guardian/guardian-stats';
import { GuardianAttention } from '@/components/guardian/guardian-attention';
import { GuardianCourses } from '@/components/guardian/guardian-courses';
import { GuardianMarks } from '@/components/guardian/guardian-marks';
import { GuardianHomework } from '@/components/guardian/guardian-homework';
import { GuardianAchievements } from '@/components/guardian/guardian-achievements';
import { GuardianAttendance } from '@/components/guardian/guardian-attendance';
// The trend chart is the student's own «نتايجي» component, styles and all.
import '@/components/results/results.css';
import '@/components/guardian/guardian.css';

export const metadata = { title: c.meta.title };

/**
 * صفحة ولي الأمر — «وصل لفين».
 *
 * ## الأرقام هي نفسها اللي الطالب بيشوفها
 *
 * قراية واحدة (`/api/guardian/me`)، وكل بلوك فيها جاي من نفس الخدمة اللي شاشة
 * الطالب بتقرا منها — `GuardianReportService` بيقول كل واحد منين. تجميع تاني
 * بنفس المعنى كان هيخلّي الأب يشوف رقم والطالب يشوف رقم تاني، والاتنين
 * مقتنعين، ومفيش حد يعرف مين الصح.
 *
 * ## الترتيب
 *
 * اللي الأب فاتح الصفحة عشانه الأول: مين، والأسبوع عامل إزاي (الهيرو)، الأرقام
 * الأربعة، وبعدين «محتاج متابعة» على طول — مش في الآخر. بعدها التفاصيل:
 * الكورسات، الدرجات، الواجبات، الإنجازات، والسنتر.
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

  // After the read: the request is dynamic by then, so «now» is this request's.
  const now = new Date();
  const name = firstName(view.student.name) || view.student.name;

  return (
    <main className="gd">
      <GuardianHero view={view} now={now} />
      <GuardianStats view={view} />
      {/* No course yet means nothing to follow up — a green «كله تمام» there
          would be a reassurance about nothing. */}
      {view.courses.length > 0 ? <GuardianAttention items={attentionItems(view, now)} /> : null}
      <GuardianCourses courses={view.courses} now={now} />
      <GuardianMarks quizzes={view.quizzes} />
      {view.homework ? <GuardianHomework homework={view.homework} now={now} /> : null}
      <GuardianAchievements view={view} />
      {view.attendance ? <GuardianAttendance attendance={view.attendance} /> : null}
      <p className="gd-footer">{formatCopy(c.footer, { name })}</p>
    </main>
  );
}
