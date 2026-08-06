'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { copy } from '@ayman/contracts';
import { Badge, Button, Input, Label, Select, Textarea } from '@ayman/ui';
import {
  type ActionResult,
  type CreateLessonInput,
  createLessonAction,
  setLessonPublishedAction,
  setLessonTextAction,
  setLessonVideoAction,
} from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import { LessonResources } from '../lesson-resources';
import { ActionError, IDLE } from './action-state';

type Section = AdminCourseDetail['sections'][number];
type Lesson = Section['lessons'][number];

/**
 * The expanded body of one lesson: its publish toggle, the editor for whatever
 * kind it is, and its materials.
 *
 * Split out of `course-editor.tsx` (465 lines, seven components) so the file
 * that owns "what does editing a lesson look like" is not also the file that
 * owns the page shell.
 */
export function LessonPanel({ courseId, lesson }: { courseId: string; lesson: Lesson }) {
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

const LESSON_KINDS = ['video', 'text', 'attachment', 'quiz'] as const;

export function AddLessonForm({ courseId, sectionId }: { courseId: string; sectionId: string }) {
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
    <form
      action={formAction}
      className="mt-3 flex flex-wrap items-end gap-2 border-t border-line-subtle pt-3"
    >
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
