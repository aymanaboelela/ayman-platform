'use client';

import { useActionState } from 'react';
import { copy } from '@ayman/contracts';
import { Button, Label, Select } from '@ayman/ui';
import { setCourseExamAction, type ActionResult } from '@/app/(admin)/admin/courses/actions';

const c = copy.admin.exam;
const IDLE: ActionResult = { ok: true };

export interface ExamCandidate {
  id: string;
  title: string;
  sectionTitle: string;
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

  return (
    <section>
      <h2 className="mb-1 text-[length:var(--fs-title-4)] font-semibold">{c.title}</h2>
      <p className="mb-3 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">
        {c.hint}
      </p>

      {candidates.length === 0 ? (
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.noQuizLessons}</p>
      ) : (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[16rem] flex-1">
            <Label htmlFor="course-exam-lesson">{c.current}</Label>
            <Select
              id="course-exam-lesson"
              name="examLessonId"
              defaultValue={examLessonId ?? ''}
            >
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
          {state.ok ? null : (
            <p role="alert" className="w-full text-[length:var(--fs-text-xs)] text-err">
              {state.message}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
