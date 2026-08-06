'use client';

import { useRouter } from 'next/navigation';
import { useActionState } from 'react';
import { copy } from '@ayman/contracts';
import { Button, Input, Label, cn } from '@ayman/ui';
import {
  type ActionResult,
  createSectionAction,
  deleteSectionAction,
  setSectionPublishedAction,
  updateSectionAction,
} from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import type { SortableHandleProps } from '../sortable-list';
import { SortableLessonList } from './lesson-list';
import { AddLessonForm } from './lesson-panel';
import { InlineTitle } from './inline-title';
import { ConfirmButton } from './confirm-button';
import { ActionError, IDLE } from './action-state';

type Section = AdminCourseDetail['sections'][number];

const c = copy.admin.section;

/** A chevron that rotates when its `<details>` opens — `.unit__chevron`. */
function Chevron() {
  return (
    <svg
      className="unit__chevron"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One section, as a `.unit` — the same container the student's course outline
 * uses, with a filled violet header that collapses.
 *
 * Collapsing is not decoration. A twelve-section course rendered fully
 * expanded is a page nobody can navigate, which is why the student's outline
 * has been built this way since it was written; the admin was the surface
 * still rendering a flat stack.
 *
 * ## The <summary> trap
 *
 * The header is a `<summary>`, so ANY click inside it toggles the section.
 * Every interactive child — the drag handle, the inline title, the publish
 * form, the delete trigger — therefore calls `preventDefault()`. Without it,
 * renaming a section also collapses it, and picking one up to drag closes it
 * mid-gesture.
 */
export function SectionCard({
  courseId,
  section,
  examLessonId,
  defaultOpen,
  handleProps,
}: {
  courseId: string;
  section: Section;
  examLessonId: string | null;
  defaultOpen: boolean;
  handleProps: SortableHandleProps;
}) {
  const router = useRouter();
  const [toggleState, toggleAction, togglePending] = useActionState<ActionResult, FormData>(
    () => setSectionPublishedAction(courseId, section.id, !section.isPublished),
    IDLE,
  );

  const publishedCount = section.lessons.filter((lesson) => lesson.isPublished).length;

  return (
    <details className="unit" open={defaultOpen}>
      <summary className="unit__head">
        <button
          type="button"
          aria-label={copy.admin.reorder.handle}
          className="cursor-grab rounded-xs px-1 py-1 text-fg-muted focus-visible:outline-2"
          // Grabbing the handle must not collapse the section mid-gesture.
          // `stopPropagation` here too, for consistency with the controls
          // beside it — dnd-kit's listeners are on this same element and are
          // unaffected by it.
          onClick={(event) => event.stopPropagation()}
          {...handleProps.attributes}
          {...handleProps.listeners}
        >
          <span aria-hidden="true" className="block h-px w-4 bg-current" />
          <span aria-hidden="true" className="mt-1 block h-px w-4 bg-current" />
        </button>

        <span className="unit__title">
          <InlineTitle
            value={section.title}
            label={c.title}
            onSave={async (title) => {
              const result = await updateSectionAction(courseId, section.id, { title });
              if (result.ok) router.refresh();
              return result;
            }}
          />
          <span className="unit__sub">
            {publishedCount} / {section.lessons.length} {c.lessonCount}
            {section.isPublished ? '' : ` · ${copy.admin.course.statusDraft}`}
          </span>
        </span>

        <span className="row-actions">
          {/* `stopPropagation`, not `preventDefault`: the click must not reach
              the <summary> (which would collapse the section), but cancelling
              its default action would also cancel the form submission this
              button exists to trigger. */}
          <form action={toggleAction} onClick={(event) => event.stopPropagation()}>
            <button
              type="submit"
              disabled={togglePending}
              className={cn('chip', section.isPublished ? 'chip--done' : 'chip--solid')}
            >
              {section.isPublished ? copy.admin.course.unpublish : copy.admin.course.publish}
            </button>
          </form>

          <span aria-hidden="true" className="row-actions__sep" />

          {/* No consequence line: a section holds no progress rows of its own,
              and the API refuses outright if any lesson inside it has student
              attempts. */}
          <ConfirmButton
            className="chip chip--danger"
            label={c.delete}
            title={c.delete}
            body={c.deleteConfirm}
            onConfirm={async () => {
              const result = await deleteSectionAction(courseId, section.id);
              if (result.ok) router.refresh();
              return result;
            }}
          />
        </span>

        <Chevron />
      </summary>

      <div className="unit__body">
        <ActionError state={toggleState} />

        {section.lessons.length === 0 ? (
          <p className="px-2 py-3 text-[length:var(--fs-text-sm)] text-fg-muted">
            {copy.admin.lesson.empty}
          </p>
        ) : (
          <SortableLessonList
            // Remounts (and re-seeds the debounce hook's local order) only
            // when the lesson SET changes — adding/removing a lesson — never
            // on a pure reorder, which is the hook's own concern.
            key={section.lessons.map((lesson) => lesson.id).join(',')}
            courseId={courseId}
            sectionId={section.id}
            examLessonId={examLessonId}
            lessons={section.lessons}
          />
        )}

        <AddLessonForm courseId={courseId} sectionId={section.id} />
      </div>
    </details>
  );
}

export function AddSectionForm({ courseId }: { courseId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (_previous, formData) =>
      createSectionAction(courseId, String(formData.get('title') ?? '')),
    IDLE,
  );

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-2">
      <div className="min-w-[16rem] flex-1">
        <Label htmlFor={`new-section-${courseId}`}>{c.title}</Label>
        <Input id={`new-section-${courseId}`} name="title" required minLength={2} />
      </div>
      <Button type="submit" disabled={pending}>
        {c.new}
      </Button>
      <ActionError state={state} />
    </form>
  );
}
