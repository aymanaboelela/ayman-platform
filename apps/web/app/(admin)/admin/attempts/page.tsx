import { copy } from '@ayman/contracts/copy/admin';
import { readAttemptsView } from './nav';
import { AttemptsOverview } from './overview';
import { QuizAttempts } from './quiz-view';

export const metadata = { title: copy.quizAdmin.attemptsTitle };

/**
 * `/admin/attempts` — «محاولات الطلاب».
 *
 * ## Two levels, because one flat stream read as a mess
 *
 * «الدنيا ملخبطة… عايز أعرف ده امتحان إيه وفي أنهي كورس، وكل حاجة تحت الكورس
 * بتاعها» (2026-10). Every sitting of every lecture quiz, course exam and
 * monthly exam used to arrive in ONE newest-first table that named a paper by
 * its lesson title alone — «اختبار», in which course? — with no total, and a
 * sort dropdown whose value was never sent to the API.
 *
 * Now the screen opens on the courses, each split into its units and quizzes
 * in the course's own order, every quiz named for what it is («كويز المحاضرة
 * ٣»، «الامتحان الشامل»، «امتحان الشهر») with its counts on its card; a quiz
 * opens its own list with state tabs, a student search, a working sort and
 * pages with a total. The same shape `/admin/homework` took for the same
 * complaint.
 *
 * ## Server components, with the client islands handed their words
 *
 * Everything here renders on the server and every control is a link, a GET
 * form or `ListControl` writing the URL, so the URL is the whole state. The
 * three client components it mounts (`ListControl`, `AttemptActions`,
 * `AttemptReviewDialog`) existed before this screen and read no copy key added
 * for it — a tab left open across a deploy keeps the copy module it loaded
 * first, and a new key read on the client would be `undefined` there.
 *
 * `adminGet` (uncached), like every admin list: a cached admin read is
 * indistinguishable from a lost write.
 *
 * `/admin/quizzes/[quizId]/attempts` — the builder's own link — is left as it
 * was, over the per-quiz route that still answers a bare array.
 */
export default async function AdminAttemptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const view = readAttemptsView(await searchParams);
  return view.view === 'quiz' ? <QuizAttempts params={view.params} /> : <AttemptsOverview params={view.params} />;
}
