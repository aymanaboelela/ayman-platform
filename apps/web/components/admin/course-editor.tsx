'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useState } from 'react';
import { toast } from 'sonner';
import type { Taxonomy } from '@ayman/contracts';
import { copy } from '@ayman/contracts';
import { Badge, Button, Input, Label, Select, Textarea } from '@ayman/ui';
import {
  type ActionResult,
  type CreateLessonInput,
  createLessonAction,
  createSectionAction,
  deleteCourseAction,
  setCourseStatusAction,
  setLessonPublishedAction,
  setLessonTextAction,
  setLessonVideoAction,
  setSectionPublishedAction,
  updateCourseAction,
} from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import { CourseExamPicker } from './course-exam-picker';
import { LessonResources } from './lesson-resources';
import { CourseForm } from './course-form';
import { SortableLessonList } from './sortable-lesson-list';

type Section = AdminCourseDetail['sections'][number];
type Lesson = Section['lessons'][number];

const COURSE_STATUS_LABEL = {
  draft: copy.admin.course.statusDraft,
  published: copy.admin.course.statusPublished,
  archived: copy.admin.course.statusArchived,
} as const;

const IDLE: ActionResult = { ok: true };

function ActionError({ state }: { state: ActionResult }) {
  if (state.ok) return null;
  return (
    <p role="alert" aria-live="polite" className="text-[length:var(--fs-text-xs)] text-err">
      {state.message}
    </p>
  );
}

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
    <Button type="button" variant="danger" size="sm" onClick={() => void onDelete()} disabled={pending}>
      {copy.admin.actions.delete}
    </Button>
  );
}

export function CourseEditor({ course, taxonomy }: { course: AdminCourseDetail; taxonomy: Taxonomy }) {
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
        <h2 className="mb-3 text-[length:var(--fs-title-4)] font-semibold">{copy.admin.course.edit}</h2>
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
              <SectionEditor key={section.id} courseId={course.id} section={section} />
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

function SectionEditor({ courseId, section }: { courseId: string; section: Section }) {
  const [toggleState, toggleAction, togglePending] = useActionState<ActionResult, FormData>(
    () => setSectionPublishedAction(courseId, section.id, !section.isPublished),
    IDLE,
  );

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium text-fg">{section.title}</h3>
          {section.summary ? <p className="text-fg-muted">{section.summary}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={section.isPublished ? 'accent' : 'neutral'}>
            {section.isPublished ? copy.admin.course.statusPublished : copy.admin.course.statusDraft}
          </Badge>
          <form action={toggleAction}>
            <Button type="submit" variant="ghost" size="sm" disabled={togglePending}>
              {section.isPublished ? copy.admin.course.unpublish : copy.admin.course.publish}
            </Button>
          </form>
        </div>
      </div>
      <ActionError state={toggleState} />

      {section.lessons.length === 0 ? (
        <p className="text-fg-muted">{copy.admin.lesson.empty}</p>
      ) : (
        <SortableLessonList
          // Remounts (and re-seeds the debounce hook's local order) only
          // when the lesson SET changes — adding/removing a lesson — never
          // on a pure reorder, which is the hook's own concern.
          key={section.lessons.map((lesson) => lesson.id).join(',')}
          courseId={courseId}
          sectionId={section.id}
          lessons={section.lessons}
          renderDetails={(lesson) => <LessonDetails courseId={courseId} lesson={lesson} />}
        />
      )}

      <AddLessonForm courseId={courseId} sectionId={section.id} />
    </div>
  );
}

function LessonDetails({ courseId, lesson }: { courseId: string; lesson: Lesson }) {
  const [toggleState, toggleAction, togglePending] = useActionState<ActionResult, FormData>(
    () => setLessonPublishedAction(courseId, lesson.id, !lesson.isPublished),
    IDLE,
  );

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between gap-3">
        <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
          {lesson.video ? lesson.video.externalId : ''}
        </p>
        <div className="flex items-center gap-2">
          <Badge tone={lesson.isPublished ? 'accent' : 'neutral'}>
            {lesson.isPublished ? copy.admin.course.statusPublished : copy.admin.course.statusDraft}
          </Badge>
          <form action={toggleAction}>
            <Button type="submit" variant="ghost" size="sm" disabled={togglePending}>
              {lesson.isPublished ? copy.admin.course.unpublish : copy.admin.course.publish}
            </Button>
          </form>
        </div>
      </div>
      <ActionError state={toggleState} />

      {lesson.kind === 'video' ? <LessonVideoForm courseId={courseId} lesson={lesson} /> : null}
      {lesson.kind === 'text' ? <LessonTextForm courseId={courseId} lesson={lesson} /> : null}
      {lesson.kind === 'quiz' ? (
        // Plan 5: a quiz is 1:1 with its lesson, created lazily on first
        // visit — see `app/(admin)/admin/quizzes/lesson/[lessonId]/page.tsx`.
        <Link
          href={`/admin/quizzes/lesson/${lesson.id}`}
          className="mt-3 inline-block text-[length:var(--fs-text-sm)] text-accent-text underline"
        >
          {copy.quizAdmin.quizTitle}
        </Link>
      ) : null}

      {/*
        Outside the kind switch on purpose. Materials hang off EVERY lesson
        kind — the presentation a video lesson was taught from is the whole
        reason this exists — and the predecessor's kind gate is exactly what
        made that impossible.
      */}
      <LessonResources courseId={courseId} lessonId={lesson.id} resources={lesson.resources} />
    </div>
  );
}

function LessonVideoForm({ courseId, lesson }: { courseId: string; lesson: Lesson }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (_previous, formData) => {
      const url = String(formData.get('url') ?? '');
      const durationSeconds = Number(formData.get('durationSeconds') ?? 0);
      return setLessonVideoAction(courseId, lesson.id, { url, durationSeconds });
    },
    IDLE,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
      <div className="min-w-[16rem] flex-1">
        <Label htmlFor={`video-url-${lesson.id}`}>{copy.admin.lesson.videoUrl}</Label>
        <Input
          id={`video-url-${lesson.id}`}
          name="url"
          dir="ltr"
          // The payload carries the ELEVEN-CHARACTER id, never the URL the
          // admin originally pasted — `extractYouTubeId` discards it, which is
          // what eliminates the SSRF class. So the field is rebuilt from the
          // id in its canonical short form, which round-trips: the extractor
          // maps it back to exactly the same id, making a save of an untouched
          // field a no-op.
          //
          // Empty was not a cosmetic problem. The field is `required`, so an
          // admin correcting only the DURATION had to retype the whole URL or
          // the form refused to submit.
          defaultValue={lesson.video ? `https://youtu.be/${lesson.video.externalId}` : undefined}
          required
        />
        <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
          {copy.admin.lesson.videoUrlHint}
        </p>
      </div>
      <div className="w-32">
        <Label htmlFor={`video-duration-${lesson.id}`}>{copy.admin.lesson.durationSeconds}</Label>
        <Input
          id={`video-duration-${lesson.id}`}
          name="durationSeconds"
          type="number"
          min={1}
          defaultValue={lesson.video?.durationSeconds ?? undefined}
          required
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {copy.admin.common.save}
      </Button>
      <ActionError state={state} />
    </form>
  );
}

/**
 * The body editor.
 *
 * Takes the whole lesson rather than an id so it can prefill. It used to take
 * `lessonId` alone and render an empty `required` textarea over whatever was
 * already stored — the instructor saw a blank field, typed into it, and
 * replaced content they had never been shown. The payload simply did not carry
 * `text`; `findForAdmin` now selects it.
 */
function LessonTextForm({ courseId, lesson }: { courseId: string; lesson: Lesson }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (_previous, formData) =>
      setLessonTextAction(courseId, lesson.id, String(formData.get('bodyHtml') ?? '')),
    IDLE,
  );

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <Label htmlFor={`body-${lesson.id}`}>{copy.admin.lesson.body}</Label>
      <Textarea
        id={`body-${lesson.id}`}
        name="bodyHtml"
        dir="ltr"
        rows={8}
        defaultValue={lesson.text?.bodyHtml ?? ''}
        required
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {copy.admin.common.save}
        </Button>
        <ActionError state={state} />
      </div>
    </form>
  );
}

function AddSectionForm({ courseId }: { courseId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (_previous, formData) => createSectionAction(courseId, String(formData.get('title') ?? '')),
    IDLE,
  );

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-2">
      <div className="min-w-[16rem] flex-1">
        <Label htmlFor={`new-section-${courseId}`}>{copy.admin.section.title}</Label>
        <Input id={`new-section-${courseId}`} name="title" required />
      </div>
      <Button type="submit" disabled={pending}>
        {copy.admin.section.new}
      </Button>
      <ActionError state={state} />
    </form>
  );
}

const LESSON_KINDS = ['video', 'text', 'attachment', 'quiz'] as const;

function AddLessonForm({ courseId, sectionId }: { courseId: string; sectionId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (_previous, formData) => {
      const input: CreateLessonInput = {
        title: String(formData.get('title') ?? ''),
        kind: (formData.get('kind') as CreateLessonInput['kind']) ?? 'video',
      };
      return createLessonAction(courseId, sectionId, input);
    },
    IDLE,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line-subtle pt-3">
      <div className="min-w-[12rem] flex-1">
        <Label htmlFor={`new-lesson-title-${sectionId}`}>{copy.admin.lesson.title}</Label>
        <Input id={`new-lesson-title-${sectionId}`} name="title" required />
      </div>
      <div className="w-40">
        <Label htmlFor={`new-lesson-kind-${sectionId}`}>{copy.admin.lesson.kind}</Label>
        <Select id={`new-lesson-kind-${sectionId}`} name="kind" defaultValue="video">
          {LESSON_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {copy.course.lessonKind[kind]}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {copy.admin.lesson.new}
      </Button>
      <ActionError state={state} />
    </form>
  );
}
