'use client';

import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';
import { reorderSectionsAction } from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import { SortableList } from '../sortable-list';
import type { ReorderStatus } from '../use-debounced-reorder';
import { SectionCard } from './section-card';

const STATUS_LABEL: Record<ReorderStatus, string> = {
  idle: '',
  pending: copy.admin.common.saving,
  saving: copy.admin.common.saving,
  saved: copy.admin.common.saved,
  error: copy.admin.common.saveFailed,
};

/**
 * `SortableList` bound to `reorderSectionsAction`.
 *
 * That action, and the endpoint behind it, have existed since the sections API
 * shipped and had NO caller — the course page rendered its sections with a
 * plain `.map()`. Reordering was implemented, tested, and unreachable.
 *
 * Only the first section opens by default: a twelve-section course rendered
 * fully expanded is a page nobody can navigate.
 */
export function SectionList({
  courseId,
  sections,
  examLessonId,
  courseStream,
}: {
  courseId: string;
  sections: AdminCourseDetail['sections'];
  examLessonId: string | null;
  /** The course's pair, so a lesson labelled outside it can be flagged. */
  courseStream?: { forGeneral: boolean; forLanguages: boolean };
}) {
  return (
    <SortableList
      items={sections}
      onReorder={(orderedIds) => reorderSectionsAction(courseId, orderedIds)}
      renderItem={(section, handleProps) => (
        <SectionCard
          courseId={courseId}
          section={section}
          examLessonId={examLessonId}
          defaultOpen={section.id === sections[0]?.id}
          handleProps={handleProps}
          courseStream={courseStream}
        />
      )}
      announcements={{
        // `pickedUpSection`, not the shared `pickedUp` — that one says
        // «المحاضرة», and announcing a section as a lecture to a screen reader
        // is exactly the bug this file would otherwise have copied.
        pickedUp: (position) => `${copy.admin.reorder.pickedUpSection} ${position}`,
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
