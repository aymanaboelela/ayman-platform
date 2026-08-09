'use client';

import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import { copy, extractYouTubeId } from '@ayman/contracts';
import { Button, Input, Label, Select, Textarea } from '@ayman/ui';
import {
  type ActionResult,
  type CreateLessonInput,
  createLessonAction,
  probeVideoDurationAction,
  setLessonTextAction,
  setLessonVideoAction,
  updateLessonAction,
} from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import { MediaKeyField } from '@/components/admin/media-key-field';
import { formatDuration } from '@/lib/format';
import { LessonResources } from '../lesson-resources';
import { ActionError, IDLE } from './action-state';
import { LessonSettingsForm } from './lesson-settings-form';
import { fetchYouTubeDuration } from './youtube-duration';

type Section = AdminCourseDetail['sections'][number];
type Lesson = Section['lessons'][number];

/**
 * The expanded body of one lesson: the editor for whatever kind it is, plus
 * its materials.
 *
 * Split out of `course-editor.tsx` (465 lines, seven components) so the file
 * that owns "what does editing a lesson look like" is not also the file that
 * owns the page shell.
 *
 * ⚠️ NO publish toggle here, and that is the point.
 *
 * This panel used to carry one, because before the split it WAS the whole
 * lesson UI. `LessonCard` now owns the row's actions — publish among them — so
 * keeping this one meant every lesson had TWO controls doing the same thing,
 * one in the row and one inside the panel. It stayed invisible while the panel
 * defaulted to collapsed; the moment a test opened it, four publish buttons
 * appeared on a page that should have three.
 *
 * Two controls for one action is not merely untidy: they render from the same
 * `lesson.isPublished`, so pressing one leaves the other showing the old label
 * until a refresh lands.
 */
export function LessonPanel({
  courseId,
  lesson,
  courseStream,
}: {
  courseId: string;
  lesson: Lesson;
  /** Passed down so the settings form can flag a lesson its course excludes. */
  courseStream?: { forGeneral: boolean; forLanguages: boolean };
}) {
  return (
    <div className="mt-2">
      {lesson.video ? (
        <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
          {lesson.video.externalId}
        </p>
      ) : null}

      {lesson.kind === 'video' ? <LessonVideoForm courseId={courseId} lesson={lesson} /> : null}
      {lesson.kind === 'text' ? <LessonTextForm courseId={courseId} lesson={lesson} /> : null}

      {/*
        OUTSIDE the kind switch, deliberately — it used to be `kind === 'quiz'`.

        `Lesson.quiz` is 1:1 with ANY lesson: the schema says `quiz Quiz?` on
        the lesson, not on a quiz-kind lesson, and the whole engine works the
        same either way. The gate meant the most ordinary thing a teacher wants
        — a short quiz at the end of the lecture they just recorded — was the
        one arrangement the admin could not express. It was the same mistake
        `LessonResource` documents in its own model comment, where a kind gate
        stopped a video lesson carrying the deck it was taught from.

        Still created lazily on first visit, see
        `app/(admin)/admin/quizzes/lesson/[lessonId]/page.tsx`.
      */}
      <Link
        href={`/admin/quizzes/lesson/${lesson.id}`}
        className="mt-3 inline-block text-[length:var(--fs-text-sm)] text-accent-text underline"
      >
        {lesson.quiz ? copy.quizAdmin.quizTitle : copy.admin.lesson.addQuiz}
      </Link>

      {/*
        Outside the kind switch on purpose. Materials hang off EVERY lesson
        kind — the presentation a video lesson was taught from is the whole
        reason this exists — and the predecessor's kind gate is exactly what
        made that impossible.
      */}
      <LessonResources courseId={courseId} lessonId={lesson.id} resources={lesson.resources} />

      {/*
        Built and unit-tested since it shipped, and rendered NOWHERE until now —
        `grep` found it referenced only by its own test file. So free preview,
        the estimated duration and the completion rule were all writable
        through the API and unreachable from the admin, exactly like the cover
        and the poster.
      */}
      <LessonSettingsForm
        lesson={lesson}
        courseStream={courseStream}
        onSave={(input) => updateLessonAction(courseId, lesson.id, input)}
      />
    </div>
  );
}

function LessonVideoForm({ courseId, lesson }: { courseId: string; lesson: Lesson }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (_previous, formData) => {
      const url = String(formData.get('url') ?? '');
      /*
       * ABSENT is the normal case. The API asks YouTube itself, so the browser
       * only states a number when it already has one — its own probe answered,
       * or the manual field appeared because nothing else could.
       */
      const typed = Number(formData.get('durationSeconds') ?? 0);
      const durationSeconds = Number.isFinite(typed) && typed > 0 ? typed : undefined;
      // Empty string means "no thumbnail", which is what «شيل الصورة» submits.
      const posterKey = String(formData.get('posterKey') ?? '') || null;
      return setLessonVideoAction(courseId, lesson.id, { url, durationSeconds, posterKey });
    },
    IDLE,
  );

  /*
   * There is NO duration field here any more, and that is the change.
   *
   * «مدة الفيديو دي الكود اللي يعرفها، مش أنا — تعرفها من فيديو يوتيوب اللي
   * هحطه». It was a `required` number input, so a video whose probe came back
   * empty did not merely lack a convenience: the form refused to submit at all
   * until seconds were counted off a YouTube page by hand.
   *
   * Now the number is resolved SERVER-side inside `setVideo`, from YouTube's
   * own watch page — no key, no quota, and unaffected by whatever the admin's
   * browser has installed. What runs below is only the preview, so the
   * duration is visible before saving rather than appearing after.
   */
  const [url, setUrl] = useState(
    lesson.video ? `https://youtu.be/${lesson.video.externalId}` : '',
  );
  const [duration, setDuration] = useState(String(lesson.video?.durationSeconds ?? ''));
  const [probing, setProbing] = useState(false);
  /** Both probes came back empty. Only then is a number asked of a human. */
  const [probeFailed, setProbeFailed] = useState(false);

  /*
   * The last id we asked YouTube about, so a paste followed by more typing in
   * the same field does not mount a second player for the same video.
   *
   * Seeded with the SAVED video's id: its duration is already in the field, and
   * re-probing it every time the panel expands would cost a frame load for a
   * number we have.
   */
  const probedId = useRef<string | null>(lesson.video?.externalId ?? null);

  /*
   * In the CHANGE HANDLER, not in an effect.
   *
   * Asking YouTube how long a video is, is a response to the instructor pasting
   * a link — an event — not a synchronisation between React state and an
   * external system. `react-hooks/incompatible-library` says so out loud
   * ("calling setState synchronously within an effect can trigger cascading
   * renders") and it is right: as an effect this re-ran on every render that
   * touched `lesson.video`, and needed a cancelled-flag and a dependency array
   * to stop it probing twice. Here it runs exactly when a new id appears.
   */
  function probe(videoId: string) {
    setProbing(true);
    setProbeFailed(false);
    // The read-out belongs to the OLD link until this one answers. Leaving it
    // up would show a confident duration for a video nobody has asked about —
    // and, worse, submit it in the hidden field.
    setDuration('');
    /*
     * SERVER first, browser second.
     *
     * The server reads the number off YouTube's watch page: no API key, no
     * extension can block it, and it answers for videos that refuse to embed —
     * which is most of the cases where the old browser-only probe returned
     * nothing. The IFrame player stays as the second chance because it asks
     * from the admin's own IP and cookies, so it can succeed where a datacenter
     * request is throttled or challenged.
     */
    void probeVideoDurationAction(`https://youtu.be/${videoId}`)
      .then((result) => result.durationSeconds ?? fetchYouTubeDuration(videoId))
      .then((seconds) => {
        if (seconds !== null) {
          setDuration(String(seconds));
          return;
        }
        /*
         * A failed probe must be RETRYABLE, and must say so.
         *
         * `probedId` was set before the request and left set afterwards, so a
         * probe that came back empty — a slow network, an ad blocker eating
         * the iframe API, YouTube not answering — permanently poisoned that
         * id: pasting the SAME link again matched `probedId.current` and
         * returned immediately without asking anything. Nothing appeared, and
         * nothing said why. «مش عايز أكتبها أنا» was being answered with a
         * field that silently stayed empty and a retry that did nothing.
         *
         * Clearing the marker makes re-pasting work, and the button below
         * makes a retry possible without re-pasting at all.
         */
        probedId.current = null;
        setProbeFailed(true);
      })
      .finally(() => setProbing(false));
  }

  function onUrlChange(next: string) {
    setUrl(next);
    setProbeFailed(false);

    const videoId = extractYouTubeId(next);
    if (!videoId || videoId === probedId.current) return;
    probedId.current = videoId;
    probe(videoId);
  }

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
      <div className="min-w-[16rem] flex-1">
        <Label htmlFor={`video-url-${lesson.id}`}>{copy.admin.lesson.videoUrl}</Label>
        <Input
          id={`video-url-${lesson.id}`}
          name="url"
          dir="ltr"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
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
          required
        />
        <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
          {copy.admin.lesson.videoUrlHint}
        </p>
      </div>
      {/*
        The duration READS OUT — it is not asked for.

        A number the video itself knows has no business being a form field an
        instructor has to satisfy before saving. What is shown is the state of
        the answer: nothing yet, asking, the duration, or — only when both
        probes came back empty — one input as the escape hatch.
      */}
      <div className="w-40">
        {/* `htmlFor` only when there IS a control to point at — the read-out
            below is a paragraph, and a label bound to one is a lie to a screen
            reader about something being editable. */}
        <Label htmlFor={probeFailed ? `video-duration-${lesson.id}` : undefined}>
          {probeFailed ? copy.admin.lesson.durationSeconds : copy.admin.lesson.duration}
        </Label>
        {probeFailed ? (
          <>
            <Input
              id={`video-duration-${lesson.id}`}
              name="durationSeconds"
              type="number"
              min={1}
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              required
              autoFocus
            />
          </>
        ) : (
          <>
            {/* Hidden, because the value still travels with the form when the
                browser already found it — the server would otherwise ask
                YouTube a second time for a number this page is displaying. */}
            <input type="hidden" name="durationSeconds" value={duration} />
            <p className="min-h-[1.75rem] text-[length:var(--fs-text-lg)] tabular-nums" dir="ltr">
              {duration ? formatDuration(Number(duration)) : '—'}
            </p>
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
              {probing ? copy.admin.lesson.durationProbing : copy.admin.lesson.durationAuto}
            </p>
          </>
        )}
      </div>

      {/*
        The failure line runs FULL WIDTH, below the row — a `w-full` child of a
        wrapping flex row starts its own line. Inside the 10rem duration column
        this same sentence broke into four ragged lines beside the field it was
        explaining, which is how a clear message reads as a glitch.
      */}
      {probeFailed ? (
        <p className="w-full text-[length:var(--fs-text-xs)] text-[color:var(--err)]">
          {copy.admin.lesson.durationFailed}{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              const videoId = extractYouTubeId(url);
              if (videoId) {
                probedId.current = videoId;
                probe(videoId);
              }
            }}
          >
            {copy.admin.lesson.durationRetry}
          </button>
        </p>
      ) : null}
      {/* Full width so the 16/9 preview is not squeezed between the URL and
          the duration on a narrow admin column. */}
      <div className="w-full">
        <MediaKeyField
          name="posterKey"
          id={`poster-${lesson.id}`}
          label={copy.admin.lesson.poster}
          hint={copy.admin.lesson.posterHint}
          defaultValue={lesson.video?.posterKey ?? null}
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
