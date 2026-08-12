'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useId, useState } from 'react';
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

/** A chevron that rotates when the section opens — `.unit__chevron`. */
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
 * uses, with a filled ember header that collapses.
 *
 * Collapsing is not decoration. A twelve-section course rendered fully
 * expanded is a page nobody can navigate, which is why the student's outline
 * has been built this way since it was written; the admin was the surface
 * still rendering a flat stack.
 *
 * ## Why this is not a <details>
 *
 * It was one, and the header was a `<summary>` holding the drag handle, the
 * inline title, the publish form and the delete trigger. That is invalid:
 * `<summary>` is itself a button, and interactive content nested inside one is
 * not reliably reachable by keyboard or exposed correctly to assistive tech.
 * Chrome reports it, and it was eight violations on this page alone.
 *
 * Moving the controls out from under `<summary>` and leaving them as later
 * children of the `<details>` does not work either, and the reason is the
 * element's whole point: everything except the first `<summary>` is hidden
 * while it is closed. Publish and delete would vanish on every collapsed
 * section — which is most of them.
 *
 * So the disclosure is built by hand. The CHEVRON is the button now, with
 * `aria-expanded` and `aria-controls`; the title, the handle and the actions
 * sit beside it as siblings, each reachable on its own.
 *
 * The visible trade, stated where the next person will look for it: clicking
 * the header text no longer toggles the section. The chevron does. Everything
 * in that row is a control in its own right, so a click landing on any of them
 * had to mean one thing only — and the `stopPropagation()` calls this file
 * used to need on every single child are gone with it.
 */
export function SectionCard({
  courseId,
  section,
  examLessonId,
  defaultOpen,
  handleProps,
  courseStream,
}: {
  courseId: string;
  section: Section;
  examLessonId: string | null;
  defaultOpen: boolean;
  handleProps: SortableHandleProps;
  /** The course's pair, so a lesson labelled outside it can be flagged. */
  courseStream?: { forGeneral: boolean; forLanguages: boolean };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const [toggleState, toggleAction, togglePending] = useActionState<ActionResult, FormData>(
    () => setSectionPublishedAction(courseId, section.id, !section.isPublished),
    IDLE,
  );

  const publishedCount = section.lessons.filter((lesson) => lesson.isPublished).length;

  return (
    <div className="unit" data-open={open ? '' : undefined}>
      <div className="unit__head">
        <button
          type="button"
          aria-label={copy.admin.reorder.handle}
          className="cursor-grab rounded-xs px-1 py-1 text-fg-muted focus-visible:outline-2"
          {...handleProps.attributes}
          {...handleProps.listeners}
        >
          <span aria-hidden="true" className="block h-px w-4 bg-current" />
          <span aria-hidden="true" className="mt-1 block h-px w-4 bg-current" />
        </button>

        {/*
          An <h3>, not a bare <span>. A section title IS a heading — it is how
          the outline is navigated by anyone using headings to move through the
          page, and the editor it replaced was one. Dropping the element while
          keeping the class was a silent accessibility regression, and it broke
          `admin-publish-course.e2e.ts`, which locates the section by
          `getByRole('heading', { level: 3 })` — the failure that surfaced it.
        */}
        <h3 className="unit__title">
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
        </h3>

        <span className="row-actions">
          <form action={toggleAction}>
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

        {/* The disclosure itself, and the only thing in this row that opens or
            closes the section. Labelled rather than left to the bare icon: the
            chevron is `aria-hidden`, so without this the button announces
            nothing at all. */}
        <button
          type="button"
          className="unit__toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? c.collapse : c.expand}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          <Chevron />
        </button>
      </div>

      <div className="unit__body" id={bodyId} hidden={!open}>
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
            courseStream={courseStream}
          />
        )}

        <AddLessonForm courseId={courseId} sectionId={section.id} />
      </div>
    </div>
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
