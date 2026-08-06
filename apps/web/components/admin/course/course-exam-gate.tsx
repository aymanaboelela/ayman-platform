'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts';
import { Button, Label, Select } from '@ayman/ui';
import {
  scaffoldExamAction,
  setCourseExamAction,
  type ActionResult,
} from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import { ActionError, IDLE } from './action-state';

const c = copy.admin.exam;

export interface ExamCandidate {
  id: string;
  title: string;
  sectionTitle: string;
}

/**
 * The course's final exam, drawn as the gate it actually is.
 *
 * ## Why a band and not another section
 *
 * The exam is the one object in this product with a rule nothing else has: it
 * opens only when every OTHER published lesson is cleared
 * (`progress/gate-rule.ts`). An instructor who does not know that will not
 * understand why students cannot see it.
 *
 * So the band states the rule with the course's OWN live number — «هيتفتح
 * للطالب بعد ما يخلّص ٢٤ محاضرة» — computed here from the published lessons.
 * It moves as they publish. A number that changes under your hands teaches the
 * rule; a paragraph of help text beside it would not be read.
 *
 * ## Why one button
 *
 * Building an exam by hand took five steps across three pages, and the step
 * that lazily created the quiz built a PRACTICE one — unlimited attempts,
 * answers shown mid-attempt. Correct for a lesson quiz, silently wrong for a
 * final exam. `scaffoldExamAction` does the whole thing in one transaction
 * with graded settings, and is idempotent, so this button never needs
 * disabling and a double-click cannot produce two exams.
 */
export function CourseExamGate({ course }: { course: AdminCourseDetail }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const lessons = course.sections.flatMap((section) => section.lessons);
  const examLesson = lessons.find((lesson) => lesson.id === course.examLessonId) ?? null;

  // Every published lesson EXCEPT the exam itself — which is exactly the set
  // the gate rule requires cleared before it opens.
  const publishedOthers = lessons.filter(
    (lesson) => lesson.isPublished && lesson.id !== course.examLessonId,
  ).length;

  const questionCount = examLesson?.quiz?._count.slots ?? 0;

  async function scaffold() {
    setPending(true);
    const result = await scaffoldExamAction(course.id);
    setPending(false);
    if (result.ok) {
      router.push(`/admin/quizzes/${result.quizId}`);
    } else {
      toast.error(result.message);
    }
  }

  return (
    <section className="space-y-3">
      <div className="exam-gate">
        <div className="exam-gate__body">
          <h2 className="exam-gate__title">{c.title}</h2>
          <p className="exam-gate__rule">
            {publishedOthers === 0 ? (
              c.gateNoLessons
            ) : (
              <>
                {c.gateLocked} <span className="exam-gate__count">{publishedOthers}</span>{' '}
                {c.gateLessonUnit}
              </>
            )}
            {examLesson ? (
              <>
                {' · '}
                {questionCount === 0 ? (
                  c.noQuestions
                ) : (
                  <>
                    <span className="exam-gate__count">{questionCount}</span> {c.questionCount}
                  </>
                )}
                {examLesson.quiz?.isPublished === false ? ` · ${c.draft}` : ''}
              </>
            ) : null}
          </p>
        </div>

        <div className="exam-gate__actions">
          {examLesson?.quiz ? (
            <Link href={`/admin/quizzes/${examLesson.quiz.id}`} className="chip chip--on-stage">
              {c.open}
            </Link>
          ) : (
            <button
              type="button"
              className="chip chip--solid"
              disabled={pending}
              onClick={() => void scaffold()}
            >
              {c.scaffold}
            </button>
          )}
        </div>
      </div>

      {/*
        Promoting a quiz lesson an instructor built inside a normal section is
        still possible — it is just no longer the ONLY path, which is what it
        used to be. Behind a disclosure because it is the rarer intent.
      */}
      <details>
        <summary className="cursor-pointer text-[length:var(--fs-text-sm)] text-fg-muted">
          {c.advanced}
        </summary>
        <div className="mt-3">
          <CourseExamPicker
            courseId={course.id}
            examLessonId={course.examLessonId}
            candidates={course.sections.flatMap((section) =>
              section.lessons
                .filter((lesson) => lesson.kind === 'quiz')
                .map((lesson) => ({
                  id: lesson.id,
                  title: lesson.title,
                  sectionTitle: section.title,
                })),
            )}
          />
        </div>
      </details>
    </section>
  );
}

/**
 * Designates one of the course's `quiz` lessons as its final exam.
 *
 * Only quiz lessons are offered, because that is what the API accepts — an
 * exam is a lesson carrying a quiz, which is precisely what lets the entire
 * quiz engine (versioning, attempt tokens, grading, review, appeals) apply to
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

  if (candidates.length === 0) {
    return <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.noQuizLessons}</p>;
  }

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
