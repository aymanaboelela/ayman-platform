'use client';

import type { ReactNode } from 'react';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { reorderLessonsAction } from '@/app/(admin)/admin/courses/actions';
import { SortableList, type SortableHandleProps } from './sortable-list';
import type { ReorderStatus } from './use-debounced-reorder';

type Lesson = { id: string; title: string; kind: 'video' | 'quiz' | 'attachment' | 'text' };

type Props<L extends Lesson> = {
  courseId: string;
  sectionId: string;
  lessons: L[];
  /** The publish toggle + kind-specific (video/text) inline forms, rendered below the drag row. */
  renderDetails?: (lesson: L) => ReactNode;
};

const STATUS_LABEL: Record<ReorderStatus, string> = {
  idle: '',
  pending: copy.admin.common.saving,
  saving: copy.admin.common.saving,
  saved: copy.admin.common.saved,
  error: copy.admin.common.saveFailed,
};

function LessonRow<L extends Lesson>({
  lesson,
  handleProps,
  renderDetails,
}: {
  lesson: L;
  handleProps: SortableHandleProps;
  renderDetails?: (lesson: L) => ReactNode;
}) {
  return (
    <div className="rounded-md border border-line bg-surface-3 p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={copy.admin.reorder.handle}
          className="cursor-grab rounded-xs px-2 py-1 text-fg-muted focus-visible:outline-2"
          {...handleProps.attributes}
          {...handleProps.listeners}
        >
          {/* Two hairline bars, not an emoji. */}
          <span aria-hidden="true" className="block h-px w-4 bg-current" />
          <span aria-hidden="true" className="mt-1 block h-px w-4 bg-current" />
        </button>
        <span className="min-w-0 flex-1 truncate font-medium text-fg">{lesson.title}</span>
        <span className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
          {copy.course.lessonKind[lesson.kind]}
        </span>
      </div>
      {renderDetails ? renderDetails(lesson) : null}
    </div>
  );
}

/**
 * `SortableList` bound to the lesson-reorder server action — its first
 * consumer. Drag-reorders freely across kinds within one section; the
 * publish toggle and kind-specific inline editors are supplied by the
 * caller via `renderDetails` so this component stays about ordering only.
 */
export function SortableLessonList<L extends Lesson>({
  courseId,
  sectionId,
  lessons,
  renderDetails,
}: Props<L>) {
  return (
    <SortableList
      items={lessons}
      onReorder={(orderedIds) => reorderLessonsAction(courseId, sectionId, orderedIds)}
      renderItem={(lesson, handleProps) => (
        <LessonRow lesson={lesson} handleProps={handleProps} renderDetails={renderDetails} />
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
