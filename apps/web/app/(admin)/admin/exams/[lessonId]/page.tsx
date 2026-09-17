import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { z } from '@ayman/contracts/zod';
import { copy } from '@ayman/contracts/copy/admin';
import { AdminExamListSchema, ExamLessonPickerSchema } from '@ayman/contracts/admin/exams';
import { adminGet } from '@/lib/admin-api';
import { ExamForm } from '@/components/admin/exams/exam-form';

const c = copy.admin.monthlyExams;

/** Only what the course label and the duplicate picker render. */
const CoursePickSchema = z.array(z.object({ id: z.uuid(), title: z.string() }));

/**
 * The one field the exam ROW does not carry.
 *
 * `AdminExamRow` deliberately holds what a cross-course list needs to be read
 * at a glance, and «نسبة النجاح» is not that — it is a setting. It lives on the
 * quiz, so the edit form reads it from the quiz the row already points at.
 *
 * A narrow schema, not the builder page's `HydratedQuizSchema`: this page needs
 * one number, and parsing the whole paper here would let a change to a slot's
 * shape break the exam editor.
 */
const PassPercentSchema = z.object({ settings: z.object({ passPercent: z.number() }) });

export const metadata = { title: c.edit };

/**
 * «تعديل الامتحان» — the window, the syllabus and the marks.
 *
 * ## Why it reads the LIST and not a single-exam endpoint
 *
 * There is no `GET /api/admin/exams/:lessonId`, and adding one would be a
 * second answer to a question `list()` already answers completely: every field
 * this form needs is on `AdminExamRow`, computed against one `serverTime` with
 * the phase already derived. The list is small — it is one row per monthly exam
 * across every course — so finding the row here costs a request the screen was
 * going to make anyway when he goes back.
 *
 * A `lessonId` that is not on that list is a 404 rather than an empty form: the
 * API's own `requireExamLesson` says the same thing (`exam_not_found`), and an
 * editor staring at a blank form for an exam that has been deleted cannot tell
 * that from a broken page.
 *
 * ## The paper is NOT edited here
 *
 * Questions live in the quiz builder, which is the only question editor on this
 * platform and stays that way. The list row's «حط الأسئلة» is the link.
 */
export default async function EditExamPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;

  /* The list and the course names together — neither needs the other. */
  const [{ exams }, courses] = await Promise.all([
    adminGet('/api/admin/exams', AdminExamListSchema),
    adminGet('/api/admin/courses', CoursePickSchema),
  ]);

  const row = exams.find((exam) => exam.lessonId === lessonId);
  if (!row) notFound();

  /*
   * The syllabus picker, fetched SERVER-side rather than in a mount effect, so
   * the lessons he is looking at are on screen in the first paint. An edit form
   * that renders its own current value a beat late is a form you cannot trust
   * about what it is holding.
   *
   * Both reads are allowed to be missing without taking the page down:
   * `passPercent` falls back to the API's own default and the picker to empty,
   * either of which is a form he can still fix — unlike an error page over an
   * exam that opens in an hour.
   */
  const [picker, quiz] = await Promise.all([
    adminGet(
      `/api/admin/exams/courses/${row.courseId}/lessons`,
      ExamLessonPickerSchema,
    ).catch(() => ({ sections: [] })),
    row.quizId
      ? adminGet(`/api/admin/quizzes/${row.quizId}`, PassPercentSchema).catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <>
      {/* `ArrowRight`, not `ArrowLeft` — "back" points at the inline-START
          edge, which in RTL is the right. */}
      <Link
        href="/admin/exams"
        className="inline-flex items-center gap-1 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        <ArrowRight className="size-4" aria-hidden="true" />
        {c.title}
      </Link>

      <h1 className="mt-2 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.edit}</h1>
      <p className="mt-1 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">
        {row.title}
      </p>

      <ExamForm
        courses={courses}
        initialSections={picker.sections.filter((section) => section.lessons.length > 0)}
        initial={{
          lessonId: row.lessonId,
          courseId: row.courseId,
          title: row.title,
          coveredLessonIds: row.coveredLessons.map((lesson) => lesson.lessonId),
          opensAt: row.opensAt,
          closesAt: row.closesAt,
          durationMinutes: row.durationMinutes,
          gradeOutOf: row.gradeOutOf,
          passPercent: quiz?.settings.passPercent ?? 70,
        }}
      />
    </>
  );
}
