'use client';

import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import { copy } from '@ayman/contracts/copy/admin';
import { extractYouTubeId, type VideoEmbedStatus } from '@ayman/contracts/video';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Textarea } from '@ayman/ui/components/textarea';
import {
  type ActionResult,
  type CreateLessonInput,
  createLessonAction,
  probeVideoDurationAction,
  removeLessonVideoAction,
  setLessonTextAction,
  setLessonVideoAction,
  updateLessonAction,
} from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import { MediaKeyField } from '@/components/admin/media-key-field';
import { formatDuration } from '@/lib/format';
import { LessonResources } from '../lesson-resources';
import { ActionError, IDLE } from './action-state';
import { useAutosave } from './autosave';
import { ConfirmButton } from './confirm-button';
import { LessonSettingsForm } from './lesson-settings-form';
import { VideoPreview } from './video-preview';
import { fetchYouTubeDuration } from './youtube-duration';

type Section = AdminCourseDetail['sections'][number];
type Lesson = Section['lessons'][number];

const c = copy.admin.lesson;

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
 * ⚠️ And no «حفظ» buttons either, for a related reason: every block below saves
 * itself. The page carried about twenty of them, one per block, with no dirty
 * tracking anywhere — so typing a description and navigating away lost it in
 * silence, and «بضيف بضيف وكل شوية حفظ» was the whole editing experience. See
 * `autosave.tsx` for the rule that replaced them.
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
      {/*
        The title lives HERE now, not in the row.

        It used to be a click-to-rename button sitting on the row's largest
        target — the one place an instructor presses to open a lecture. So the
        press that meant «افتح المحاضرة» swapped the text for a same-sized input
        at the same position, which reads as nothing having happened. The row's
        title is plain text again and the rename is an ordinary field, beside
        every other thing about the lecture, saving itself like all of them.
      */}
      <LessonTitleField courseId={courseId} lesson={lesson} />

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
        {lesson.quiz ? copy.quizAdmin.quizTitle : c.addQuiz}
      </Link>

      {/*
        Outside the kind switch on purpose. Materials hang off EVERY lesson
        kind — the presentation a video lesson was taught from is the whole
        reason this exists — and the predecessor's kind gate is exactly what
        made that impossible.
      */}
      <LessonResources courseId={courseId} lessonId={lesson.id} resources={lesson.resources} />

      <LessonSettingsForm
        lesson={lesson}
        courseStream={courseStream}
        onSave={(input) => updateLessonAction(courseId, lesson.id, input)}
      />
    </div>
  );
}

/**
 * The lecture's name.
 *
 * `LessonUpdateSchema` requires at least two characters, so a title cleared on
 * the way to a new one is not sent — the same rule the inline editor enforced
 * by reverting, except nothing here reverts: what is on screen is what the
 * instructor typed, and the write simply waits for it to be a name.
 */
function LessonTitleField({ courseId, lesson }: { courseId: string; lesson: Lesson }) {
  const [title, setTitle] = useState(lesson.title);
  const { save } = useAutosave<string>({
    onSave: (value) => updateLessonAction(courseId, lesson.id, { title: value }),
  });

  return (
    <div className="max-w-[28rem]">
      <Label htmlFor={`lesson-title-${lesson.id}`}>{c.title}</Label>
      <Input
        id={`lesson-title-${lesson.id}`}
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          if (event.target.value.trim().length >= 2) save(event.target.value);
        }}
      />
    </div>
  );
}

/** What the instructor is told about each answer the embed check can give. */
const EMBED_NOTE: Record<VideoEmbedStatus, { text: string; tone: 'ok' | 'warn' | 'err' }> = {
  ok: { text: c.embedOk, tone: 'ok' },
  blocked: { text: c.embedBlocked, tone: 'err' },
  unavailable: { text: c.embedUnavailable, tone: 'err' },
  unknown: { text: c.embedUnknown, tone: 'warn' },
};

const EMBED_TONE_CLASS = {
  ok: 'text-[color:var(--ok)]',
  warn: 'text-fg-muted',
  err: 'text-[color:var(--err)]',
} as const;

function LessonVideoForm({ courseId, lesson }: { courseId: string; lesson: Lesson }) {
  /*
   * No duration field in the normal case, and no save button at all.
   *
   * «مدة الفيديو دي الكود اللي يعرفها، مش أنا — تعرفها من فيديو يوتيوب اللي
   * هحطه». The number is resolved SERVER-side from YouTube's own watch page —
   * no key, no quota, unaffected by whatever the admin's browser has installed
   * — and the same request now answers the question the duration never could:
   * whether YouTube will let this video play inside our page.
   */
  const [url, setUrl] = useState(lesson.video ? `https://youtu.be/${lesson.video.externalId}` : '');
  const [posterKey, setPosterKey] = useState(lesson.video?.posterKey ?? null);
  const [duration, setDuration] = useState(String(lesson.video?.durationSeconds ?? ''));
  const [probing, setProbing] = useState(false);
  /** Both probes came back empty. Only then is a number asked of a human. */
  const [probeFailed, setProbeFailed] = useState(false);
  const [embed, setEmbed] = useState<VideoEmbedStatus | null>(null);
  const [removed, setRemoved] = useState(false);

  const { save } = useAutosave<{
    url: string;
    durationSeconds?: number;
    posterKey: string | null;
  }>({
    onSave: (input) => setLessonVideoAction(courseId, lesson.id, input),
    // Longer than a text field's: this write makes the API ask YouTube, so a
    // half-typed id costs a round trip to a third party.
    delayMs: 900,
  });

  /*
   * The last id we asked YouTube about, so a paste followed by more typing in
   * the same field does not ask twice about the same video.
   *
   * Seeded with the SAVED video's id: its duration is already in the field, and
   * re-probing it every time the panel expands would cost a request for a
   * number we have.
   */
  const probedId = useRef<string | null>(lesson.video?.externalId ?? null);

  function commit(next: { durationSeconds?: number; posterKey?: string | null; url?: string }) {
    const nextUrl = next.url ?? url;
    // Nothing to save until the field holds a real id. An empty or half-typed
    // box is not a request to delete the video — «شيل الفيديو» is.
    if (extractYouTubeId(nextUrl) === null) return;

    /*
     * ALWAYS send the duration we already have, on every write — not only on
     * the write the probe triggered.
     *
     * `setVideo` re-asks YouTube whenever the payload carries no duration, and
     * refuses with a 422 if YouTube will not answer. On a datacenter IP YouTube
     * frequently will not: it serves the bot challenge instead. So uploading a
     * POSTER — a write that has nothing to do with the duration — re-ran that
     * probe, hit the challenge, and the 422 took the poster down with it.
     * Reported as «المفروض أنا ضايف صورة ودلوقتي بجيبها مش ظاهرة»: the image
     * uploaded fine and the save that would have stored its key was rejected
     * over a number the page was already displaying.
     *
     * The number IS on screen — the browser's own probe supplies it when the
     * server's cannot — so sending it costs nothing and removes the server's
     * only reason to ask again.
     */
    const known = Number(duration);
    const durationSeconds =
      next.durationSeconds ?? (Number.isFinite(known) && known > 0 ? known : undefined);

    save({
      url: nextUrl,
      durationSeconds,
      posterKey: next.posterKey === undefined ? posterKey : next.posterKey,
    });
  }

  /*
   * In the CHANGE HANDLER, not in an effect.
   *
   * Asking YouTube about a video is a response to the instructor pasting a link
   * — an event — not a synchronisation between React state and an external
   * system. `react-hooks/incompatible-library` says so out loud ("calling
   * setState synchronously within an effect can trigger cascading renders") and
   * it is right: as an effect this re-ran on every render that touched
   * `lesson.video`, and needed a cancelled-flag and a dependency array to stop
   * it probing twice.
   */
  function probe(videoId: string, sourceUrl: string) {
    setProbing(true);
    setProbeFailed(false);
    setEmbed(null);
    // The read-out belongs to the OLD link until this one answers. Leaving it
    // up would show a confident duration for a video nobody has asked about.
    setDuration('');

    /*
     * SERVER first, browser second.
     *
     * The server reads the watch page: no API key, no extension can block it,
     * and it answers for videos that refuse to embed — which is most of the
     * cases where the old browser-only probe returned nothing. The IFrame
     * player stays as the second chance because it asks from the admin's own IP
     * and cookies, so it can succeed where a datacenter request is throttled.
     */
    void probeVideoDurationAction(`https://youtu.be/${videoId}`)
      .then(async (result) => {
        setEmbed(result.embed);
        const seconds = result.durationSeconds ?? (await fetchYouTubeDuration(videoId));
        if (seconds !== null) {
          setDuration(String(seconds));
          commit({ url: sourceUrl, durationSeconds: seconds });
          return;
        }
        /*
         * A failed probe must be RETRYABLE, and must say so.
         *
         * `probedId` was set before the request and left set afterwards, so a
         * probe that came back empty — a slow network, an ad blocker eating the
         * iframe API, YouTube not answering — permanently poisoned that id:
         * pasting the SAME link again matched `probedId.current` and returned
         * immediately without asking anything. Nothing appeared, and nothing
         * said why.
         */
        probedId.current = null;
        setProbeFailed(true);
      })
      .finally(() => setProbing(false));
  }

  function onUrlChange(next: string) {
    setUrl(next);
    setProbeFailed(false);
    setRemoved(false);

    const videoId = extractYouTubeId(next);
    if (!videoId || videoId === probedId.current) return;
    probedId.current = videoId;
    probe(videoId, next);
  }

  const savedId = removed ? null : (lesson.video?.externalId ?? null);
  const note = embed === null ? null : EMBED_NOTE[embed];

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[16rem] flex-1">
          <Label htmlFor={`video-url-${lesson.id}`}>{c.videoUrl}</Label>
          {/*
            The payload carries the ELEVEN-CHARACTER id, never the URL the admin
            pasted — `extractYouTubeId` discards it, which is what eliminates the
            SSRF class. So the field is rebuilt from the id in its canonical
            short form, which round-trips: the extractor maps it back to exactly
            the same id, making a re-save of an untouched field a no-op.
          */}
          <Input
            id={`video-url-${lesson.id}`}
            dir="ltr"
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
          />
          <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.videoUrlHint}</p>
        </div>

        {/*
          The duration READS OUT — it is not asked for.

          A number the video itself knows has no business being a form field an
          instructor has to satisfy. What is shown is the state of the answer:
          nothing yet, asking, the duration, or — only when both probes came
          back empty — one input as the escape hatch.
        */}
        <div className="w-40">
          {/* `htmlFor` only when there IS a control to point at — the read-out
              below is a paragraph, and a label bound to one is a lie to a
              screen reader about something being editable. */}
          <Label htmlFor={probeFailed ? `video-duration-${lesson.id}` : undefined}>
            {probeFailed ? c.durationSeconds : c.duration}
          </Label>
          {probeFailed ? (
            <Input
              id={`video-duration-${lesson.id}`}
              type="number"
              min={1}
              value={duration}
              onChange={(event) => {
                setDuration(event.target.value);
                const seconds = Number(event.target.value);
                if (Number.isFinite(seconds) && seconds > 0) commit({ durationSeconds: seconds });
              }}
              autoFocus
            />
          ) : (
            <>
              <p className="min-h-[1.75rem] text-[length:var(--fs-text-lg)] tabular-nums" dir="ltr">
                {duration ? formatDuration(Number(duration)) : '—'}
              </p>
              <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
                {probing ? c.durationProbing : c.durationAuto}
              </p>
            </>
          )}
        </div>
      </div>

      {/*
        The failure line runs FULL WIDTH, below the row — inside the 10rem
        duration column this same sentence broke into four ragged lines beside
        the field it was explaining, which is how a clear message reads as a
        glitch.
      */}
      {probeFailed ? (
        <p className="text-[length:var(--fs-text-xs)] text-[color:var(--err)]">
          {c.durationFailed}{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              const videoId = extractYouTubeId(url);
              if (videoId) {
                probedId.current = videoId;
                probe(videoId, url);
              }
            }}
          >
            {c.durationRetry}
          </button>
        </p>
      ) : null}

      {/*
        THE CHECK THAT DID NOT EXIST.

        Saving a video only ever verified that a duration could be found, and
        the duration comes from the watch page — which answers happily for a
        video the embed player refuses. So a lecture whose «السماح بالتضمين» was
        switched off saved with a correct duration and no warning, and then
        showed every student «الفيديو مش متاح دلوقتي» with nothing anywhere
        naming the cause. Reported as «ضفت الفيديو وشغال وبابلك، وبيقول مش متاح».
      */}
      {probing ? (
        <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.embedChecking}</p>
      ) : note ? (
        <p
          role={note.tone === 'err' ? 'alert' : 'status'}
          className={`text-[length:var(--fs-text-xs)] ${EMBED_TONE_CLASS[note.tone]}`}
        >
          {note.text}
        </p>
      ) : null}

      <MediaKeyField
        name="posterKey"
        id={`poster-${lesson.id}`}
        label={c.poster}
        hint={c.posterHint}
        defaultValue={lesson.video?.posterKey ?? null}
        onChange={(key) => {
          setPosterKey(key);
          commit({ posterKey: key });
        }}
      />

      {savedId ? (
        <div className="space-y-2">
          {/*
            «بضغط عليها... جاب الفيديو مش متاح» — the admin had no way to watch
            its own lecture at all. The student route is gated on an active
            enrolment compiled into the query, with no role bypass, so opening
            it as the instructor is a 404 and a redirect.
          */}
          <VideoPreview externalId={savedId} />
          <ConfirmButton
            className="chip chip--quiet"
            label={c.removeVideo}
            title={c.removeVideo}
            body={c.removeVideoConfirm}
            successMessage={c.removeVideoDone}
            onConfirm={async () => {
              const result = await removeLessonVideoAction(courseId, lesson.id);
              if (result.ok) {
                // Local, because the row is gone and the panel has to stop
                // offering a preview of it before the refresh lands.
                setRemoved(true);
                setUrl('');
                setDuration('');
                setEmbed(null);
                probedId.current = null;
              }
              return result;
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The body editor.
 *
 * Takes the whole lesson rather than an id so it can prefill. It used to take
 * `lessonId` alone and render an empty textarea over whatever was already
 * stored — the instructor saw a blank field, typed into it, and replaced
 * content they had never been shown. The payload simply did not carry `text`;
 * `findForAdmin` now selects it.
 *
 * An emptied box is NOT saved. `LessonTextInputSchema` requires a non-empty
 * body, and there is no "delete the text" endpoint — writing a space to satisfy
 * the schema would be inventing one, and would do it silently.
 */
function LessonTextForm({ courseId, lesson }: { courseId: string; lesson: Lesson }) {
  const [bodyHtml, setBodyHtml] = useState(lesson.text?.bodyHtml ?? '');
  const { save } = useAutosave<string>({
    onSave: (value) => setLessonTextAction(courseId, lesson.id, value),
    // Prose, so the pause between two words is longer than in a number field.
    delayMs: 1200,
  });

  return (
    <div className="mt-3 space-y-2">
      <Label htmlFor={`body-${lesson.id}`}>{c.body}</Label>
      <Textarea
        id={`body-${lesson.id}`}
        dir="ltr"
        rows={8}
        value={bodyHtml}
        onChange={(event) => {
          setBodyHtml(event.target.value);
          if (event.target.value.trim().length > 0) save(event.target.value);
        }}
      />
    </div>
  );
}

const LESSON_KINDS = ['video', 'text', 'attachment', 'quiz'] as const;

/**
 * Adding a lecture stays an explicit BUTTON while every field autosaves, and
 * the difference is real: editing a field states a value, but creating a row is
 * an act. An outline that sprouted an empty lecture because a cursor landed in
 * a box would be worse than one save button, not better.
 */
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
        <Label htmlFor={`new-lesson-title-${sectionId}`}>{c.title}</Label>
        <Input id={`new-lesson-title-${sectionId}`} name="title" required />
      </div>
      <div className="w-40">
        <Label htmlFor={`new-lesson-kind-${sectionId}`}>{c.kind}</Label>
        {/* `defaultValue`, NOT a controlled `value`. React 19 resets a form when
            its action resolves, and a controlled `<select>` has no `selected`
            attribute for that reset to restore — it falls through to the first
            option instead. That is exactly the «من غير قاعدة» bug, and this is
            the shape that does not have it. */}
        <Select id={`new-lesson-kind-${sectionId}`} name="kind" defaultValue="video">
          {LESSON_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {copy.course.lessonKind[kind]}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {c.new}
      </Button>
      <ActionError state={state} />
    </form>
  );
}
