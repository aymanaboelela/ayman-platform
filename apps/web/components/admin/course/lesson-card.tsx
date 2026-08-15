'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';
import { LessonKindIcon } from '@/components/player/lesson-kind-icon';
import {
  deleteLessonAction,
  setLessonPublishedAction,
} from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import type { SortableHandleProps } from '../sortable-list';
import { ConfirmButton } from './confirm-button';
import { LessonPanel } from './lesson-panel';

type Lesson = AdminCourseDetail['sections'][number]['lessons'][number];

const c = copy.admin.lesson;

/**
 * One lesson, rendered as the row a student will see it as.
 *
 * `.lesson-row` and its icon well come from `app/study.css` — the same objects
 * the student's course outline is built from. That is the point: an instructor
 * arranging lessons should be looking at the thing they are arranging, not at
 * a private admin table that drifts from it.
 *
 * The action set is the one deliberate divergence. A student's row ends in ONE
 * chip («مشاهدة»); this ends in four, and four chips at equal weight stop
 * being a row and become a toolbar. So delete sits past a hairline and stays
 * colourless until hover — one click away, never the first thing the eye lands
 * on. See `.row-actions` in `(admin)/admin.css`.
 *
 * ## The row opens the lecture
 *
 * It did not, and it looked exactly as though it did. `.lesson-row` is the
 * student outline's object, reused here on purpose — including its `:hover`
 * wash. On the student side every such row ends in a link and the wash marks
 * that; here the same wash sat on a row with no click target anywhere on it, so
 * «بضغط عليها مش شغالة» was an accurate reading of what the page promised.
 *
 * The pointer handler is layered ON TOP of the «تعديل» chip rather than
 * replacing it. The chip stays the keyboard- and screen-reader-reachable
 * control carrying `aria-expanded`; the row click is an affordance for the
 * mouse, so nothing new enters the tab order. Clicks landing on any interactive
 * descendant are left alone — renaming a title or pressing نشر must not also
 * toggle the panel.
 */
export function LessonCard({
  courseId,
  lesson,
  isExam,
  handleProps,
  courseStream,
}: {
  courseId: string;
  lesson: Lesson;
  isExam: boolean;
  handleProps: SortableHandleProps;
  /** The course's pair, so a lesson labelled outside it can be flagged. */
  courseStream?: { forGeneral: boolean; forLanguages: boolean };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // A quiz lesson with no slots cannot be answered. Saying so on the row is
  // what stops an instructor publishing an empty exam and finding out from a
  // student.
  const quizIsEmpty = lesson.kind === 'quiz' && (lesson.quiz?._count.slots ?? 0) === 0;

  return (
    <div className="rounded-md border border-line bg-surface-3">
      <div
        className="lesson-row cursor-pointer"
        onClick={(event) => {
          // Anything the instructor could have MEANT to press keeps its own
          // behaviour: the drag handle, the four chips, the inline title's
          // rename button and its input, the confirm dialog's trigger.
          if ((event.target as HTMLElement).closest('button, a, input, select, textarea')) return;
          setOpen((value) => !value);
        }}
      >
        <button
          type="button"
          aria-label={copy.admin.reorder.handle}
          className="cursor-grab rounded-xs px-1 py-1 text-fg-muted focus-visible:outline-2"
          {...handleProps.attributes}
          {...handleProps.listeners}
        >
          {/* Two hairline bars, not an emoji. */}
          <span aria-hidden="true" className="block h-px w-4 bg-current" />
          <span aria-hidden="true" className="mt-1 block h-px w-4 bg-current" />
        </button>

        <span className="lesson-row__well" aria-hidden="true">
          <LessonKindIcon kind={lesson.kind} className="size-4" />
        </span>

        {/*
          PLAIN TEXT, not an `<InlineTitle>`.

          The title used to be a click-to-rename button, and it is the exact
          place an instructor aims at to OPEN a lecture — so «بضغط عليها مش
          شغالة» was, from the row's point of view, a click that swapped the
          text for a same-sized input at the same position and looked like
          nothing happening at all. The title is now the row's largest
          open-the-lecture target, and renaming lives in the panel that opens,
          as an ordinary autosaving field beside everything else about the
          lecture. Sections keep their inline title: a section has no panel.
        */}
        <span className="lesson-row__text">
          <span className="lesson-row__title">{lesson.title}</span>
          <span className="mono block text-[length:var(--fs-mono-label)] text-fg-muted">
            {copy.course.lessonKind[lesson.kind]}
            {isExam ? ` · ${copy.admin.exam.title}` : ''}
            {lesson.video ? ` · ${lesson.video.externalId}` : ''}
            {quizIsEmpty ? ` · ${copy.admin.exam.noQuestions}` : ''}
          </span>
        </span>

        <span className="row-actions">
          <button
            type="button"
            className={cn('chip', open ? 'chip--done' : 'chip--quiet')}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {c.edit}
          </button>

          {lesson.kind === 'quiz' ? (
            <Link href={`/admin/quizzes/lesson/${lesson.id}`} className="chip chip--quiet">
              {copy.quizAdmin.quizTitle}
            </Link>
          ) : null}

          <form
            action={async () => {
              const result = await setLessonPublishedAction(
                courseId,
                lesson.id,
                !lesson.isPublished,
              );
              if (result.ok) router.refresh();
            }}
          >
            {/* Amber when the next press PUBLISHES — that is the action the
                page wants. Quiet ember once it is live, because unpublishing
                is a correction, not the goal. */}
            <button
              type="submit"
              className={cn('chip', lesson.isPublished ? 'chip--done' : 'chip--solid')}
            >
              {lesson.isPublished ? copy.admin.course.unpublish : copy.admin.course.publish}
            </button>
          </form>

          <span aria-hidden="true" className="row-actions__sep" />

          <ConfirmButton
            className="chip chip--danger"
            label={c.delete}
            title={c.delete}
            body={c.deleteConfirm}
            consequence={
              lesson._count.progress > 0
                ? `${c.deleteWithProgress} ${lesson._count.progress}`
                : null
            }
            onConfirm={async () => {
              const result = await deleteLessonAction(courseId, lesson.id);
              if (result.ok) router.refresh();
              return result;
            }}
          />
        </span>
      </div>

      {open ? (
        <div className="border-t border-line-subtle px-3 pb-3">
          <LessonPanel courseId={courseId} lesson={lesson} courseStream={courseStream} />
        </div>
      ) : null}
    </div>
  );
}
