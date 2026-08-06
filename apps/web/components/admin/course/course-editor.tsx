'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useState } from 'react';
import { toast } from 'sonner';
import type { Taxonomy } from '@ayman/contracts';
import { copy } from '@ayman/contracts';
import { Badge, Button } from '@ayman/ui';
import {
  type ActionResult,
  deleteCourseAction,
  setCourseStatusAction,
  updateCourseAction,
} from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import { CourseExamPicker } from './course-exam-gate';
import { CourseForm } from '../course-form';
import { AddSectionForm, SectionCard } from './section-card';
import { ActionError, IDLE } from './action-state';

const COURSE_STATUS_LABEL = {
  draft: copy.admin.course.statusDraft,
  published: copy.admin.course.statusPublished,
  archived: copy.admin.course.statusArchived,
} as const;

/**
 * Retiring a finished course — distinct from `unpublish` (which goes to
 * `draft`, i.e. "still being worked on"). Same confirm+toast shape as
 * `DeleteSubjectButton` (taxonomy/subjects/subjects-editor.tsx), not the
 * `useActionState`+`ActionError` shape the publish toggle above uses: this
 * is a standalone destructive-ish action, not a form field.
 */
function ArchiveCourseButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onArchive() {
    if (!window.confirm(copy.admin.course.archiveConfirm)) return;
    setPending(true);
    const result = await setCourseStatusAction(courseId, 'archived');
    setPending(false);
    if (result.ok) {
      toast.success(copy.admin.actions.archive);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => void onArchive()}
      disabled={pending}
    >
      {copy.admin.actions.archive}
    </Button>
  );
}

function RestoreCourseButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onRestore() {
    if (!window.confirm(copy.admin.course.restoreConfirm)) return;
    setPending(true);
    const result = await setCourseStatusAction(courseId, 'draft');
    setPending(false);
    if (result.ok) {
      toast.success(copy.admin.actions.restore);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => void onRestore()}
      disabled={pending}
    >
      {copy.admin.actions.restore}
    </Button>
  );
}

/**
 * I4 (audit): the API 409s when the course has student quiz attempts —
 * `deleteCourseAction` already turns that into `copy.admin.course.deleteBlockedAttempts`.
 * A course with no attempts hard-deletes and this navigates back to the list,
 * since the detail page it was just rendered from no longer exists.
 */
function DeleteCourseButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onDelete() {
    if (!window.confirm(copy.admin.course.deleteConfirm)) return;
    setPending(true);
    const result = await deleteCourseAction(courseId);
    setPending(false);
    if (result.ok) {
      toast.success(copy.admin.actions.delete);
      router.push('/admin/courses');
    } else {
      toast.error(result.message);
    }
  }

  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      onClick={() => void onDelete()}
      disabled={pending}
    >
      {copy.admin.actions.delete}
    </Button>
  );
}

/**
 * The course builder's page shell.
 *
 * This file was 465 lines holding seven components — the shell, the section
 * editor, the lesson panel, three inline forms and the status buttons — and
 * every capability still to be wired would have grown it further. It now owns
 * the shell only; `section-card.tsx` and `lesson-panel.tsx` own the objects.
 */
export function CourseEditor({
  course,
  taxonomy,
}: {
  course: AdminCourseDetail;
  taxonomy: Taxonomy;
}) {
  const nextStatus = course.status === 'published' ? 'draft' : 'published';
  const [publishState, publishAction, publishPending] = useActionState<ActionResult, FormData>(
    () => setCourseStatusAction(course.id, nextStatus),
    IDLE,
  );

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-[length:var(--fs-title-2)] font-semibold">{course.title}</h1>
          <p className="mono mt-1 text-[length:var(--fs-mono-label)] text-fg-muted">{course.slug}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge tone={course.status === 'published' ? 'accent' : 'neutral'}>
            {COURSE_STATUS_LABEL[course.status]}
          </Badge>
          <div className="flex items-center gap-2">
            {course.status === 'archived' ? (
              // Archived only ever goes back to draft: restoring straight to
              // published would skip the "at least one published lesson"
              // check that setStatus('published') enforces fresh every time.
              <RestoreCourseButton courseId={course.id} />
            ) : (
              <>
                <form action={publishAction}>
                  <Button
                    type="submit"
                    variant={course.status === 'published' ? 'secondary' : 'primary'}
                    disabled={publishPending}
                  >
                    {course.status === 'published'
                      ? copy.admin.course.unpublish
                      : copy.admin.course.publish}
                  </Button>
                </form>
                {/* I4 (audit): a distinct state from `draft` — retiring a
                    finished course is a different intent from an instructor
                    unpublishing a work-in-progress, and the catalog (which
                    filters on `status: 'published'` exactly) excludes both. */}
                <ArchiveCourseButton courseId={course.id} />
              </>
            )}
          </div>
          <ActionError state={publishState} />
          {/* I4 (audit): a course with any student quiz attempt can never be
              hard-deleted — attempt_events is append-only at the DB level,
              forever, even after archiving. deleteCourseAction surfaces that
              refusal in Arabic and points at archiving instead of a raw
              stack trace. A course with no attempts still hard-deletes. */}
          <DeleteCourseButton courseId={course.id} />
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-[length:var(--fs-title-4)] font-semibold">
          {copy.admin.course.edit}
        </h2>
        <CourseForm
          taxonomy={taxonomy}
          defaults={{
            slug: course.slug,
            title: course.title,
            subtitle: course.subtitle,
            description: course.description,
            systemId: course.systemId,
            year: course.year,
            trackId: course.trackId,
            subjectId: course.subjectId,
          }}
          action={updateCourseAction.bind(null, course.id)}
        />
      </section>

      <section>
        <h2 className="mb-3 text-[length:var(--fs-title-4)] font-semibold">{copy.course.content}</h2>
        <div className="space-y-6">
          {course.sections.length === 0 ? (
            <p className="text-fg-muted">{copy.admin.section.empty}</p>
          ) : (
            course.sections.map((section) => (
              <SectionCard key={section.id} courseId={course.id} section={section} />
            ))
          )}
        </div>
        <AddSectionForm courseId={course.id} />
      </section>

      {/*
        Last, because designating the exam only makes sense once the lessons
        it picks from exist. Only `quiz` lessons are offered — an exam IS a
        lesson carrying a quiz, which is what lets the whole quiz engine apply
        to it with no special case.
      */}
      <CourseExamPicker
        courseId={course.id}
        examLessonId={course.examLessonId}
        candidates={course.sections.flatMap((section) =>
          section.lessons
            .filter((lesson) => lesson.kind === 'quiz')
            .map((lesson) => ({
              id: lesson.id,
              title: lesson.title,
              sectionTitle: section.title,
            })),
        )}
      />
    </div>
  );
}
