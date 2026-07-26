'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { Taxonomy } from '@ayman/contracts';
import { copy } from '@ayman/contracts';
import { Badge, Button, Input, Label, Select, Textarea } from '@ayman/ui';
import {
  type ActionResult,
  type CreateLessonInput,
  createLessonAction,
  createSectionAction,
  setCourseStatusAction,
  setLessonPublishedAction,
  setLessonTextAction,
  setLessonVideoAction,
  setSectionPublishedAction,
  updateCourseAction,
} from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
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
          <form action={publishAction}>
            <Button
              type="submit"
              variant={course.status === 'published' ? 'secondary' : 'primary'}
              disabled={publishPending}
            >
              {course.status === 'published' ? copy.admin.course.unpublish : copy.admin.course.publish}
            </Button>
          </form>
          <ActionError state={publishState} />
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
      {lesson.kind === 'text' ? <LessonTextForm courseId={courseId} lessonId={lesson.id} /> : null}
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
        <Input id={`video-url-${lesson.id}`} name="url" dir="ltr" required />
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

function LessonTextForm({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (_previous, formData) => setLessonTextAction(courseId, lessonId, String(formData.get('bodyHtml') ?? '')),
    IDLE,
  );

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <Label htmlFor={`body-${lessonId}`}>{copy.admin.lesson.body}</Label>
      <Textarea id={`body-${lessonId}`} name="bodyHtml" dir="ltr" required />
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
