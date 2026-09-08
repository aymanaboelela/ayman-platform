'use client';

import { copy } from '@ayman/contracts/copy/admin';
import type { ExamLessonPicker } from '@ayman/contracts/admin/exams';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { Skeleton } from '@ayman/ui/components/skeleton';
import { cn } from '@ayman/ui/lib/cn';

const c = copy.admin.monthlyExams;

export interface CoveragePickerProps {
  /** Grouped by section, because «الوحدة ١ ٢ ٣» is how he thinks about it. */
  sections: ExamLessonPicker['sections'];
  /** ORDERED. See the note on `toggle` below. */
  selected: readonly string[];
  onChange: (next: string[]) => void;
  /** True while the picker's course has changed and its lessons are in flight. */
  loading?: boolean;
  /** Prefixes every checkbox id, so two pickers on one screen (the form and the
   *  duplicate dialog) cannot collide on `htmlFor`. */
  idPrefix: string;
}

/**
 * «الامتحان ده على أنهي دروس؟» — the syllabus line.
 *
 * ## Why the student sees this at all
 *
 * The covered lessons are the only thing an `upcoming` exam tells a student
 * that they can act on: not a score, not a paper, but what to revise. That is
 * why the API refuses an exam covering nothing (`coveredLessonIds.min(1)`) and
 * why the hint under the label says whose list this is.
 *
 * ## Grouped, and never flattened into one select
 *
 * A course runs to thirty-odd lessons. A multi-`<select>` of thirty options is
 * a scroll box you cannot see your own choices in, and «الوحدة الأولى» is the
 * unit of thought here — the exam is «على الوحدة ١ و٢», picked a unit at a
 * time. The section heading carries a count so a fully-picked unit reads as one
 * at a glance.
 *
 * ## Unpublished lessons are OFFERED, and marked
 *
 * An exam is usually written before the last lecture of the month is live, so
 * filtering drafts out would hide exactly the lessons he is setting the exam
 * on. The marker exists because coverage is a public sentence: naming a lesson
 * the student cannot open yet is a promise about what is coming, and he should
 * make it deliberately rather than by accident.
 */
export function CoveragePicker({
  sections,
  selected,
  onChange,
  loading = false,
  idPrefix,
}: CoveragePickerProps) {
  const chosen = new Set(selected);

  /**
   * Appending on check and filtering on uncheck — NOT rebuilding the list from
   * the section order.
   *
   * `coveredLessonIds` is written to `exam_coverage.position` in array order
   * and read back in that order onto the student's card. So the order is his,
   * and re-deriving it from the outline would silently reshuffle a syllabus he
   * had deliberately arranged.
   */
  function toggle(lessonId: string, next: boolean): void {
    onChange(next ? [...selected, lessonId] : selected.filter((id) => id !== lessonId));
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton width="wide" className="h-5" />
        <Skeleton width="full" className="h-5" />
        <Skeleton width="narrow" className="h-5" />
      </div>
    );
  }

  if (sections.length === 0) {
    return <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.coverageEmpty}</p>;
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line-subtle bg-surface-2 p-3">
      {sections.map((section) => {
        const picked = section.lessons.filter((lesson) => chosen.has(lesson.lessonId)).length;
        return (
          <fieldset key={section.sectionId} className="border-0 p-0">
            <legend className="mb-1.5 flex items-center gap-2 text-[length:var(--fs-text-sm)] font-semibold text-fg">
              {section.title}
              {picked > 0 ? (
                <span className="mono text-[length:var(--fs-mono-label)] font-medium text-accent-text tabular-nums">
                  {picked}
                </span>
              ) : null}
            </legend>

            <div className="flex flex-col gap-1">
              {section.lessons.map((lesson) => {
                const id = `${idPrefix}-${lesson.lessonId}`;
                const on = chosen.has(lesson.lessonId);
                return (
                  <div key={lesson.lessonId} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={on}
                      onCheckedChange={(next) => toggle(lesson.lessonId, next === true)}
                    />
                    <label
                      htmlFor={id}
                      className={cn(
                        'cursor-pointer text-[length:var(--fs-text-sm)]',
                        on ? 'text-fg' : 'text-fg-muted',
                      )}
                    >
                      {lesson.title}
                    </label>
                    {/* Ember, not red: a draft lesson is a STATE of the course,
                        not a wrong answer. Green and red belong to quiz
                        correctness and nothing else. */}
                    {!lesson.isPublished ? (
                      <span className="rounded-full border border-study-line bg-study-tint px-2 py-0.5 text-[length:var(--fs-mono-label)] text-study">
                        {copy.admin.monthlyExams.draft}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
