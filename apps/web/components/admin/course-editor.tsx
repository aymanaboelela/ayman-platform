'use client';

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
        <ul className="space-y-2">
          {section.lessons.map((lesson) => (
            <li key={lesson.id}>
              <LessonEditor courseId={courseId} lesson={lesson} />
            </li>
          ))}
        </ul>
      )}

      <AddLessonForm courseId={courseId} sectionId={section.id} />
    </div>
  );
}

function LessonEditor({ courseId, lesson }: { courseId: string; lesson: Lesson }) {
  const [toggleState, toggleAction, togglePending] = useActionState<ActionResult, FormData>(
    () => setLessonPublishedAction(courseId, lesson.id, !lesson.isPublished),
    IDLE,
  );

  return (
    <div className="rounded-md border border-line bg-surface-3 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-fg">{lesson.title}</p>
          <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
            {copy.course.lessonKind[lesson.kind]}
            {lesson.video ? ` · ${lesson.video.externalId}` : ''}
          </p>
        </div>
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
