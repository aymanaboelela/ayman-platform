'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useActionState, useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { cn } from '@ayman/ui/lib/cn';
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
import { useFeature } from '../entitlements-context';

type Section = AdminCourseDetail['sections'][number];

const c = copy.admin.section;

/**
 * Which sections are open, by id — module scope, not component state alone.
 *
 * `SectionList` is keyed on the section SET, so adding or deleting a section
 * remounts every card, and plain `useState` then snapped each one back to its
 * default: the section he had open to work in closed the moment he made the
 * next one. A map that outlives the remount is what keeps «اللي كنت فاتحه»
 * open. It lives as long as the tab, which is as long as that matters.
 */
const openSections = new Map<string, boolean>();

/**
 * The section «قسم جديد» just made. Its card opens, scrolls into view and puts
 * the cursor in «عنوان المحاضرة» when it mounts — the next thing anyone does
 * with a new section is add a lecture to it, and the form for that is at the
 * bottom of a body the page used to render closed.
 */
let focusOnMount: string | null = null;

function focusNewLesson(sectionId: string) {
  // After the body has un-hidden: `hidden` is removed in the commit this
  // follows, and a hidden input can be neither scrolled to nor focused.
  requestAnimationFrame(() => {
    const input = document.getElementById(`new-lesson-title-${sectionId}`);
    if (!(input instanceof HTMLInputElement)) return;
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    input.focus({ preventScroll: true });
  });
}

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
  terms,
  examLessonId,
  defaultOpen,
  handleProps,
}: {
  courseId: string;
  section: Section;
  /** الترم الأول / الترم الثاني — this section's own "assign to term" options. */
  terms: AdminCourseDetail['terms'];
  examLessonId: string | null;
  defaultOpen: boolean;
  handleProps: SortableHandleProps;
}) {
  const router = useRouter();
  /*
   * The state it OPENED in is remembered too, not only a toggle. An empty
   * section opens by default; two lectures later its default is closed, and
   * the next remount (adding any section) shut the one he was working in.
   * Idempotent, so React calling this initializer twice changes nothing.
   */
  const [open, setOpenState] = useState(() => {
    // ⚠️ Browser only. This module is also evaluated on the SERVER, where a
    // module-level Map outlives the request: it would carry one admin's open
    // sections into the next render for anybody, and serve a stale default
    // that disagrees with the client's first render — a hydration mismatch.
    if (typeof window === 'undefined') return defaultOpen;
    const initial = openSections.get(section.id) ?? defaultOpen;
    openSections.set(section.id, initial);
    return initial;
  });
  const bodyId = useId();
  const [publishPending, setPublishPending] = useState(false);
  const [termPending, setTermPending] = useState(false);
  const monthlyExamsOpen = useFeature('exams');

  /*
   * «امتحانات الشهر» — the shelf the monthly exams live on. It is a section
   * only because an exam is a lesson; the API refuses to rename or unpublish
   * it, and deleting it erased every monthly exam on it behind the generic
   * «حذف القسم» dialog. So it gets no rename, publish, delete or «محاضرة
   * جديدة» (a lecture added here reaches no student outline) — just a way to
   * where those exams are actually managed.
   */
  const isShelf = section.title === EXAM_SHELF_TITLE;

  /*
   * A press with a result, not a fire-and-forget form. Its error used to be
   * rendered INSIDE the section body — hidden, on every collapsed section,
   * which is most of them — so a refused publish looked like a click that
   * did nothing.
   */
  async function togglePublished() {
    setPublishPending(true);
    try {
      const result = await setSectionPublishedAction(courseId, section.id, !section.isPublished);
      if (!result.ok) toast.error(result.message);
    } catch {
      // Rejects rather than returning `ok: false` on a dropped connection or
      // a stale action id — see the same catch on the lecture row.
      toast.error(copy.admin.common.actionFailed);
    } finally {
      setPublishPending(false);
    }
  }

  /** Student progress on the lectures inside — what the delete takes with it.
   *  `Lesson.section` and `LessonProgress.lesson` both cascade; the API only
   *  refuses when there are quiz ATTEMPTS, not watched lectures. */
  const progressRows = section.lessons.reduce((sum, lesson) => sum + lesson._count.progress, 0);

  function setOpen(next: boolean) {
    openSections.set(section.id, next);
    setOpenState(next);
  }

  function startLesson() {
    setOpen(true);
    focusNewLesson(section.id);
  }

  // Once, for the section «قسم جديد» just made — see `focusOnMount`. It is
  // already OPEN: the form marked it in `openSections` before the refresh
  // that mounts this card, so the initializer above read it as open.
  useEffect(() => {
    if (focusOnMount !== section.id) return;
    focusOnMount = null;
    focusNewLesson(section.id);
  }, [section.id]);

  async function handleTermChange(nextTermId: string) {
    setTermPending(true);
    const result = await updateSectionAction(courseId, section.id, {
      termId: nextTermId === '' ? null : nextTermId,
    });
    setTermPending(false);
    // It used to say nothing either way, and a refused move looked exactly
    // like a saved one until the next reload put the old term back.
    if (result.ok) router.refresh();
    else toast.error(copy.admin.term.actionFailed);
  }

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
          {isShelf ? (
            <span className="block px-2 py-1">{section.title}</span>
          ) : (
            <InlineTitle
              value={section.title}
              label={c.title}
              onSave={async (title) => {
                const result = await updateSectionAction(courseId, section.id, { title });
                if (result.ok) router.refresh();
                return result;
              }}
            />
          )}
          <span className="unit__sub">
            {publishedCount} / {section.lessons.length} {c.lessonCount}
            {section.isPublished ? '' : ` · ${copy.admin.course.statusDraft}`}
          </span>
        </h3>

        {isShelf ? (
          <span className="row-actions">
            {monthlyExamsOpen ? (
              <Link href="/admin/exams" className="chip chip--quiet">
                {copy.admin.exam.monthlyLink}
              </Link>
            ) : null}
          </span>
        ) : (
        <span className="row-actions">
          {/* In the header, so it is there whether the section is open or not.
              It opens the section and puts the cursor in the lecture's title —
              the create form itself stays where it was, at the foot of the
              body, beside the lectures it adds to. */}
          <button type="button" className="chip chip--quiet" onClick={startLesson}>
            <Plus className="size-4" aria-hidden="true" />
            {c.addLesson}
          </button>

          {/* الترم الأول / الترم الثاني — only offered once the course has
              any terms configured at all; a course with none keeps the
              header exactly as it was before this feature. */}
          {terms.length > 0 ? (
            <Select
              aria-label={copy.admin.term.assignLabel}
              value={section.termId ?? ''}
              disabled={termPending}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => void handleTermChange(event.target.value)}
              className="h-auto min-h-0 w-auto py-1 text-[length:var(--fs-text-xs)]"
            >
              <option value="">{copy.admin.term.unassigned}</option>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.title}
                </option>
              ))}
            </Select>
          ) : null}

          <button
            type="button"
            disabled={publishPending}
            onClick={() => void togglePublished()}
            className={cn('chip', section.isPublished ? 'chip--done' : 'chip--solid')}
          >
            {section.isPublished ? copy.admin.course.unpublish : copy.admin.course.publish}
          </button>

          <span aria-hidden="true" className="row-actions__sep" />

          {/* The consequence names the student progress the delete erases with
              the lectures — it used to say nothing, on the belief that a
              section holds no progress of its own. Its lectures do. */}
          <ConfirmButton
            className="chip chip--danger"
            label={c.delete}
            title={c.delete}
            body={c.deleteConfirm}
            consequence={
              progressRows > 0 ? `${copy.admin.lesson.deleteWithProgress} ${progressRows}` : null
            }
            onConfirm={async () => {
              const result = await deleteSectionAction(courseId, section.id);
              if (result.ok) router.refresh();
              return result;
            }}
          />
        </span>
        )}

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
          onClick={() => setOpen(!open)}
        >
          <Chevron />
        </button>
      </div>

      <div className="unit__body" id={bodyId} hidden={!open}>

        {section.lessons.length === 0 ? (
          <p className="px-2 py-3 text-[length:var(--fs-text-sm)] text-fg-muted">
            {copy.admin.lesson.empty}
          </p>
        ) : (
          <SortableLessonList
            // Remounts (and re-seeds the debounce hook's local order) only
            // when the lesson SET changes — adding/removing a lesson — never
            // on a pure reorder, which is the hook's own concern.
            // SORTED ids — in server order the key changed on every reorder
            // too, and the remount closed every lecture panel open in here.
            key={section.lessons
              .map((lesson) => lesson.id)
              .sort()
              .join(',')}
            courseId={courseId}
            sectionId={section.id}
            examLessonId={examLessonId}
            lessons={section.lessons}
            onShelf={isShelf}
          />
        )}

        {isShelf ? (
          <p className="px-2 py-3 text-[length:var(--fs-text-sm)] text-fg-muted">{c.shelfNote}</p>
        ) : (
          <AddLessonForm courseId={courseId} sectionId={section.id} lessons={section.lessons} />
        )}
      </div>
    </div>
  );
}

export function AddSectionForm({
  courseId,
  terms,
}: {
  courseId: string;
  /** الترم الأول / الترم التاني — offered on the create itself once the course
   *  has any, so «الترم التاني» is a place the section is BORN in rather than a
   *  dropdown to find in its header afterwards. */
  terms: AdminCourseDetail['terms'];
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (_previous, formData) => {
      const termId = String(formData.get('termId') ?? '');
      const result = await createSectionAction(
        courseId,
        String(formData.get('title') ?? ''),
        termId === '' ? null : termId,
      );
      if (result.ok) {
        openSections.set(result.sectionId, true);
        focusOnMount = result.sectionId;
      }
      return result;
    },
    IDLE,
  );

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-2">
      <div className="min-w-[16rem] flex-1">
        <Label htmlFor={`new-section-${courseId}`}>{c.title}</Label>
        <Input id={`new-section-${courseId}`} name="title" required minLength={2} />
      </div>
      {terms.length > 0 ? (
        <div className="w-40">
          <Label htmlFor={`new-section-term-${courseId}`}>{copy.admin.term.assignLabel}</Label>
          {/* `defaultValue`, not a controlled `value` — see the kind select in
              `AddLessonForm` for why a controlled select and React's post-action
              form reset do not mix. */}
          <Select id={`new-section-term-${courseId}`} name="termId" defaultValue="">
            <option value="">{copy.admin.term.unassigned}</option>
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.title}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <Button type="submit" disabled={pending}>
        {c.new}
      </Button>
      <ActionError state={state} />
    </form>
  );
}
