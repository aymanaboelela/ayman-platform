import Link from 'next/link';
import { Plus } from 'lucide-react';
import { z } from '@ayman/contracts/zod';
import { copy } from '@ayman/contracts/copy/admin';
import { AdminExamListSchema } from '@ayman/contracts/admin/exams';
import { adminGet } from '@/lib/admin-api';
import { ExamRow } from '@/components/admin/exams/exam-row';

const c = copy.admin.monthlyExams;

/** Only what the duplicate dialog's picker renders. Narrow on purpose, the same
 *  reason الواجبات's own course pick is narrow: this feeds a list of names, and
 *  parsing the admin course list's full shape here would let an unrelated
 *  field's change break the exams screen. */
const CoursePickSchema = z.array(z.object({ id: z.uuid(), title: z.string() }));

export const metadata = { title: c.title };

/**
 * `/admin/exams` — «امتحانات الشهر», and the ONLY door to one.
 *
 * ## Why this screen exists rather than living in the course editor
 *
 * A COURSE exam is reached through `courses.exam_lesson_id` and belongs to one
 * course's outline, which is where it is edited. A MONTHLY exam is a different
 * object: it covers a chosen SUBSET of lessons, it carries its own open/close
 * window, and four of them are authored a month across four courses. The
 * question he actually asks is «إيه اللي نازل ومتى؟» — a cross-course list —
 * and that list cannot live inside any single course's editor.
 *
 * It is also the only path that can create one at all: `LESSON_KINDS` in the
 * lesson panel is `['video','text','attachment']` on purpose, so nothing in the
 * course editor can author a quiz-kind lesson.
 *
 * ## The order is the API's, not this file's
 *
 * `ScheduledExamsService.list` sorts open → upcoming → closed, soonest first
 * within the live group and newest first within the history, against ONE
 * `serverTime` so two rows cannot straddle a phase boundary and disagree.
 * Re-sorting here would be a second answer to the same question — and one
 * computed off the reader's clock, which is exactly what `examPhase` takes an
 * explicit `now` to avoid.
 *
 * `adminGet` (uncached), like every admin list: a cached admin read is
 * indistinguishable from a lost write, and this one is read minutes before an
 * exam opens.
 */
export default async function AdminExamsPage() {
  /*
   * Both in parallel. The course list is only for «كرره على كورسات تانية», so
   * making the exam list wait on it would slow the screen down for the reader
   * who never opens that dialog.
   */
  const [{ exams }, courses] = await Promise.all([
    adminGet('/api/admin/exams', AdminExamListSchema),
    adminGet('/api/admin/courses', CoursePickSchema),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
          <p className="mt-1 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">
            {c.lead}
          </p>
        </div>
        <Link href="/admin/exams/new" className="chip chip--solid">
          <Plus className="size-4" aria-hidden="true" />
          {c.create}
        </Link>
      </div>

      {exams.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.empty}</p>
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-2.5">
          {exams.map((exam) => (
            <li key={exam.lessonId}>
              <ExamRow
                row={exam}
                /* An exam duplicated onto its own course would be a second,
                   identical paper on the same shelf. */
                courses={courses.filter((course) => course.id !== exam.courseId)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
