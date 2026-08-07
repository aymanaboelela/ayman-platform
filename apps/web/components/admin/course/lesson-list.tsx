'use client';

import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { reorderLessonsAction } from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
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
 * in `LessonCard`, so this component stays about ordering only.
 */
export function SortableLessonList({
  courseId,
  sectionId,
  examLessonId,
  lessons,
  courseStream,
}: {
  courseId: string;
  sectionId: string;
  examLessonId: string | null;
  lessons: Lesson[];
  /** The course's pair, so a lesson labelled outside it can be flagged. */
  courseStream?: { forGeneral: boolean; forLanguages: boolean };
}) {
  return (
    <SortableList
      items={lessons}
      onReorder={(orderedIds) => reorderLessonsAction(courseId, sectionId, orderedIds)}
      renderItem={(lesson, handleProps) => (
        <LessonCard
          courseId={courseId}
          lesson={lesson}
          isExam={lesson.id === examLessonId}
          handleProps={handleProps}
          courseStream={courseStream}
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
