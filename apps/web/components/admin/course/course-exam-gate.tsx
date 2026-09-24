'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import { Button } from '@ayman/ui/components/button';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import {
  scaffoldExamAction,
  setCourseExamAction,
  type ActionResult,
} from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import { ActionError, IDLE } from './action-state';
import { examPrerequisiteCount } from './exam-gate-count';
import { useFeature } from '../entitlements-context';

const c = copy.admin.exam;

export interface ExamCandidate {
  id: string;
  title: string;
  sectionTitle: string;
}

/**
 * The course's final exam — one quiet row at the foot of the outline.
 *
 * ## Why it is not the band at the top any more
 *
 * It was the loudest object on the page: a full-width ember gradient right
 * under the course form, on EVERY course, stating «هيتفتح للطالب بعد ما يخلّص
 * ٦ محاضرة» whether or not the course had an exam at all. Most courses do not
 * — the exams he actually sets are the monthly ones, which have their own page
 * — so the page's most prominent sentence was a rule about nothing, with a
 * number nobody could reproduce: «طب دي ليه؟… الامتحان هيتفتح إمتى؟».
 *
 * So:
 *   - no exam → one line saying it is optional, the button to add one, and a
 *     link to the monthly exams he was probably looking for;
 *   - an exam → the rule, TRUE this time (`examPrerequisiteCount` is the gate's
 *     own set), whether students can see it yet, and the way in.
 *
 * At the foot of the outline because that is where it sits for the student:
 * the exam is the course's last step, not its heading.
 *
 * ## Why one button
 *
 * Building an exam by hand took five steps across three pages, and the step
 * that lazily created the quiz built a PRACTICE one — unlimited attempts,
 * answers shown mid-attempt. `scaffoldExamAction` does the whole thing in one
 * transaction with graded settings, and is idempotent, so a double-click
 * cannot produce two exams.
 */
export function CourseExamGate({
  course,
  sellsBySlice,
}: {
  course: AdminCourseDetail;
  /** The course sells months or terms — a one-slice buyer never clears every
   *  lecture, so the rule needs its second clause. */
  sellsBySlice: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // امتحانات الشهر فيتشر لكل ستاك لوحده — لينك لصفحة بترجع 404 أسوأ من مفيش.
  const monthlyExamsOpen = useFeature('exams');

  const examSection =
    course.sections.find((section) =>
      section.lessons.some((lesson) => lesson.id === course.examLessonId),
    ) ?? null;
  const examLesson = examSection?.lessons.find((lesson) => lesson.id === course.examLessonId) ?? null;

  const prerequisites = examPrerequisiteCount(course.sections, course.examLessonId);
  const questionCount = examLesson?.quiz?._count.slots ?? 0;
  // Live only when the quiz, its lesson AND its section are all published:
  // the gate never loads a lesson from a draft section, so a published quiz in
  // an unpublished section is an exam no student will ever meet.
  const visible =
    examLesson !== null &&
    examSection !== null &&
    examSection.isPublished &&
    examLesson.isPublished &&
    examLesson.quiz?.isPublished === true;

  // Legacy quiz lessons only — a monthly exam lives on the «امتحانات الشهر»
  // shelf with its own window and coverage, and promoting one to the final
  // would make it wait on every lecture of the course.
  const candidates: ExamCandidate[] = course.sections
    .filter((section) => section.title !== EXAM_SHELF_TITLE)
    .flatMap((section) =>
      section.lessons
        .filter((lesson) => lesson.kind === 'quiz')
        .map((lesson) => ({ id: lesson.id, title: lesson.title, sectionTitle: section.title })),
    );

  async function scaffold() {
    setPending(true);
    try {
      const result = await scaffoldExamAction(course.id);
      if (result.ok) router.push(`/admin/quizzes/${result.quizId}`);
      else toast.error(result.message);
    } catch {
      // A dropped connection or a stale action id after a deploy REJECTS
      // rather than returning `ok: false` — and without this the button stayed
      // disabled until a reload.
      toast.error(c.scaffoldFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="exam-row" aria-labelledby={`exam-row-${course.id}`}>
      <div className="exam-row__main">
        <div className="min-w-0 flex-1">
          <h2 id={`exam-row-${course.id}`} className="exam-row__title">
            {c.title}
          </h2>
          {examLesson === null ? (
            <p className="exam-row__text">
              {c.noneYet}
              {/* Only where that page exists — on a stack without the feature
                  it would point at a 404. */}
              {monthlyExamsOpen ? ` ${c.noneYetMonthly}` : ''}
            </p>
          ) : (
            <>
              <p className="exam-row__text">
                {prerequisites === 0 ? c.gateNoLessons : formatCopy(c.gateRule, { n: prerequisites })}
                {prerequisites > 0 && sellsBySlice ? ` ${c.gateSliceNote}` : ''}
              </p>
              <p className="exam-row__meta">
                {questionCount === 0 ? c.noQuestions : `${questionCount} ${c.questionCount}`}
                {visible ? '' : ` · ${c.hidden}`}
              </p>
            </>
          )}
        </div>

        <div className="exam-row__actions">
          {examLesson?.quiz ? (
            <Link href={`/admin/quizzes/${examLesson.quiz.id}`} className="chip chip--solid">
              {c.open}
            </Link>
          ) : (
            <button
              type="button"
              className="chip chip--quiet"
              disabled={pending}
              onClick={() => void scaffold()}
            >
              {c.scaffold}
            </button>
          )}
          {monthlyExamsOpen ? (
            <Link href="/admin/exams" className="chip chip--quiet">
              {c.monthlyLink}
            </Link>
          ) : null}
        </div>
      </div>

      {/*
        Promoting a quiz lesson an instructor built inside a normal section is
        still possible — it is just not the ONLY path, which it used to be.
        Behind a disclosure because it is the rarer intent, and absent when
        there is nothing to promote: its empty state used to ask for «محاضرة
        من نوع اختبار», which the editor can no longer make.
      */}
      {candidates.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-[length:var(--fs-text-sm)] text-fg-muted">
            {c.advanced}
          </summary>
          <div className="mt-3">
            <CourseExamPicker
              courseId={course.id}
              examLessonId={course.examLessonId}
              candidates={candidates}
            />
          </div>
        </details>
      ) : null}
    </section>
  );
}

/**
 * Designates one of the course's `quiz` lessons as its final exam.
 *
 * Only quiz lessons are offered, because that is what the API accepts — an
 * exam is a lesson carrying a quiz, which is precisely what lets the entire
 * quiz engine (versioning, attempt tokens, grading, the review matrix) apply to
 * it with no special case anywhere.
 */
export function CourseExamPicker({
  courseId,
  examLessonId,
  candidates,
}: {
  courseId: string;
  examLessonId: string | null;
  candidates: ExamCandidate[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (_previous, formData) => {
      const value = String(formData.get('examLessonId') ?? '');
      return setCourseExamAction(courseId, value.length > 0 ? value : null);
    },
    IDLE,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="min-w-[16rem] flex-1">
        <Label htmlFor="course-exam-lesson">{c.current}</Label>
        <Select id="course-exam-lesson" name="examLessonId" defaultValue={examLessonId ?? ''}>
          <option value="">{c.none}</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.sectionTitle} — {candidate.title}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {c.save}
      </Button>
      <ActionError state={state} />
    </form>
  );
}
