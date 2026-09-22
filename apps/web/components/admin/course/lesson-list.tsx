'use client';

import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';
import { reorderLessonsAction } from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import { nestedQuizIds } from '@/lib/course-outline';
import { SortableList } from '../sortable-list';
import type { ReorderStatus } from '../use-debounced-reorder';
import { LessonCard } from './lesson-card';

type Lesson = AdminCourseDetail['sections'][number]['lessons'][number];

const STATUS_LABEL: Record<ReorderStatus, string> = {
  idle: '',
  pending: copy.admin.common.saving,
  saving: copy.admin.common.saving,
  saved: copy.admin.common.saved,
  error: copy.admin.common.saveFailed,
};

/**
 * `SortableList` bound to the lesson-reorder action. Drag-reorders freely
 * across kinds within one section; everything about how a lesson LOOKS lives
 * in `LessonCard`.
 *
 * The one thing this component knows about appearance is which rows are
 * SUBORDINATE — a quiz belongs under the lecture it checks — because that is a
 * fact about a row's POSITION in the list, which is the thing this component
 * owns. `LessonCard` cannot work it out from a lesson alone.
 */
export function SortableLessonList({
  courseId,
  sectionId,
  examLessonId,
  lessons,
}: {
  courseId: string;
  sectionId: string;
  examLessonId: string | null;
  lessons: Lesson[];
}) {
  /**
   * Which rows are a lecture's quiz, and therefore belong UNDER it.
   *
   * ⚠️ `groupIntoEntries` — the student side's rule, imported rather than
   * re-implemented. Ownership is ADJACENCY in reading order: a non-exam quiz
   * belongs to the nearest lecture before it in the same section, which is
   * also what `resolveGate` uses to decide when that quiz opens.
   *
   * That equivalence is the reason this is a derived value and not a stored
   * one. Drag a quiz above a different lecture and it is that lecture's quiz —
   * in the outline, in the gate, and in the indent here — with nothing to keep
   * in sync. A second notion of ownership living only in the admin would be a
   * flag that could disagree with the gate the student actually hits.
   *
   * A quiz with no lecture before it in its section falls through as a
   * top-level row rather than vanishing, same as the student outline.
   */
  const nested = nestedQuizIds(lessons, examLessonId);

  return (
    <SortableList
      items={lessons}
      onReorder={(orderedIds) => reorderLessonsAction(courseId, sectionId, orderedIds)}
      renderItem={(lesson, handleProps) => (
        <LessonCard
          courseId={courseId}
          lesson={lesson}
          isExam={lesson.id === examLessonId}
          isNested={nested.has(lesson.id)}
          handleProps={handleProps}
        />
      )}
      announcements={{
        pickedUp: (position) => `${copy.admin.reorder.pickedUp} ${position}`,
        movedOver: (position) => `${copy.admin.reorder.movedOver} ${position}`,
        dropped: (position) => `${copy.admin.reorder.dropped} ${position}`,
        cancelled: copy.admin.reorder.cancelled,
      }}
      statusSlot={(status) => (
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{copy.admin.reorder.hint}</p>
          <p
            aria-live="polite"
            className={cn(
              'mono text-[length:var(--fs-mono-label)]',
              status === 'error' ? 'text-err' : 'text-fg-muted',
            )}
          >
            {STATUS_LABEL[status]}
          </p>
        </div>
      )}
    />
  );
}
