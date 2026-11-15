'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AlignLeft, CircleCheck, Layers, Paperclip, PenLine, StickyNote } from 'lucide-react';
import { isCompletionUndoable } from '@ayman/contracts/completion-undo';
import { copy } from '@ayman/contracts/copy';
import type { HeartbeatResponse, LessonPlayer } from '@ayman/contracts/progress';
import { formatDuration } from '@/lib/format';
import { postOpen } from '@/lib/progress-client';
import { AttachmentLesson } from './attachment-lesson';
import { LessonNav } from './lesson-nav';
import { LessonTabs, type LessonTab } from './lesson-tabs';
import { QuizLesson } from './quiz-lesson';
import { ResourceList } from './resource-list';
import { TextLesson } from './text-lesson';
import { VideoLesson } from './video-lesson';

/** Where this lesson sits in its course — the chip row under the title. */
export interface LessonPlace {
  /** 1-based. */
  unitIndex: number;
  unitTitle: string;
  /** 1-based among the unit's LECTURES; `null` for a quiz hanging off one. */
  lectureIndex: number | null;
  lectureCount: number;
}

/**
 * The server-rendered panels that join the tabs. `null` = the lecture has no
 * such thing and the tab is not drawn — most lectures have one or two.
 */
export interface LessonPanels {
  homework: ReactNode | null;
  summary: ReactNode | null;
  notes: ReactNode | null;
  /** Drawn as the count on «ملاحظاتي». */
  notesCount: number;
}

export interface LessonPlayerProps {
  payload: LessonPlayer;
  /** The viewer's name and phone, drawn over the lecture — ours or YouTube's. */
  watermark?: string | null;
  /**
   * `?t=` — a second to start from instead of the resume point, from a note in
   * «ملاحظاتي». It wins over a finished lesson's 0 too: opening a note is
   * asking for that moment, not for a rewatch from the top.
   */
  jumpTo?: number | null;
  place: LessonPlace;
  panels: LessonPanels;
  /** The phone's door to the outline (`OutlineSheet`) — drawn under the title bar. */
  door?: ReactNode;
}

/**
 * The lesson's main column: the lecture, one bar under it, one row of tabs.
 *
 * ## The order, and why it is fixed here
 *
 * The lecture is the first pixel. Under it, in ONE bar: the title, where it
 * sits («الوحدة ٢ · المحاضرة ٥ من ٨ · 48:10») and the finish button — the
 * three things a student reads or presses on every lesson. Everything else the
 * lecture carries (homework, materials, summary, notes, a quiz) is a tab, with
 * the most urgent one open.
 *
 * It used to be: video, a quiz card, the materials open with a PDF viewer in
 * them, a sentence about how completion works, the prev/next row, THEN the
 * title, the summary, a notes form, the homework. «لما بيدخل على المحاضرة
 * بيلاقي حاجات كتير». The title arriving after the controls was the clearest
 * sign the page had grown by accretion.
 */
export function LessonPlayerView({
  payload,
  watermark = null,
  jumpTo = null,
  place,
  panels,
  door,
}: LessonPlayerProps) {
  const [progress, setProgress] = useState(payload.progress);
  const [saveFailed, setSaveFailed] = useState(false);

  // Registers the open (openCount, firstOpenedAt) and — the part students
  // actually notice — writes enrollment.lastLessonId, which is what makes
  // "أكمل من حيث وقفت" land on this exact lesson tomorrow.
  useEffect(() => {
    let cancelled = false;
    void postOpen(payload.lesson.id)
      .then((opened) => {
        if (!cancelled) setProgress(opened);
      })
      .catch(() => {
        /* the lesson is still watchable; progress just is not recorded yet */
      });
    return () => {
      cancelled = true;
    };
  }, [payload.lesson.id]);

  const onProgress = useCallback((response: HeartbeatResponse) => {
    setProgress(response.progress);
    setSaveFailed(false);
  }, []);

  const onError = useCallback(() => setSaveFailed(true), []);
  const isComplete = progress.completedAt != null;
  const isQuiz = payload.lesson.kind === 'quiz';
  /*
    From the `progress` STATE, unlike `resumeAt` below — this has to follow
    the heartbeats. A lecture finished with the button and then watched to the
    end anyway stops being undoable mid-video — the server refuses it from
    then on, since un-finishing a row past both thresholds would last exactly
    one heartbeat — and «تم» should turn back into a badge the moment that
    happens rather than on the next page load.
  */
  const undoable = isCompletionUndoable({
    kind: payload.lesson.kind,
    completedVia: progress.completedVia,
    durationSeconds: payload.video?.durationSeconds ?? 0,
    watchedSeconds: progress.watchedSeconds,
    maxPositionSeconds: progress.maxPositionSeconds,
  });

  const h = copy.player.header;
  const t = copy.player.tabs;
  const duration = payload.video?.durationSeconds ?? payload.lesson.estimatedSeconds;
  const homeworkPending =
    payload.homework !== null &&
    (payload.homework.submission === null || payload.homework.submission.status === 'needs_work');

  /*
   * The tabs, most urgent first — the first one is the one open on arrival.
   * The homework is a thing to DO; the materials were uploaded to be read; the
   * summary is for after the video; notes are the student's own; the quiz
   * hangs off the lecture and has its row in the outline too.
   */
  const tabs: LessonTab[] = [];
  if (payload.homework && panels.homework) {
    tabs.push({
      id: 'homework',
      label: t.homework,
      icon: <PenLine className="size-4" />,
      count: homeworkPending ? 1 : undefined,
      alert: homeworkPending,
      content: panels.homework,
    });
  }
  /*
   * Every lesson kind but `attachment` can carry materials — the deck it was
   * taught from, a tutorial video, extra reading. An attachment lesson draws
   * them as its MAIN object (`<AttachmentLesson>`, which also runs the dwell
   * timer that completes it), so it does not list them twice.
   */
  if (payload.lesson.kind !== 'attachment' && payload.resources.length > 0) {
    tabs.push({
      id: 'materials',
      label: t.materials,
      icon: <Paperclip className="size-4" />,
      count: payload.resources.length,
      content: <ResourceList resources={payload.resources} watermark={watermark} />,
    });
  }
  if (panels.summary) {
    tabs.push({ id: 'summary', label: t.summary, icon: <AlignLeft className="size-4" />, content: panels.summary });
  }
  if (panels.notes) {
    tabs.push({
      id: 'notes',
      label: t.notes,
      icon: <StickyNote className="size-4" />,
      count: panels.notesCount > 0 ? panels.notesCount : undefined,
      content: panels.notes,
    });
  }
  /*
   * A quiz can hang off ANY lesson kind, not only `kind: 'quiz'` — see
   * `LessonPanel`'s admin-side comment. Attached to a video (or text /
   * attachment) lesson it is a bonus alongside that lesson's own completion
   * rule, not the rule itself — hence `variant="attached"`, which swaps the
   * copy rather than the mechanics.
   */
  if (!isQuiz && payload.quiz) {
    tabs.push({
      id: 'quiz',
      label: t.quiz,
      icon: <CircleCheck className="size-4" />,
      content: (
        <QuizLesson lessonId={payload.lesson.id} progress={progress} variant="attached" facts={payload.quiz} />
      ),
    });
  }

  return (
    <div className="lp-main">
      {payload.lesson.kind === 'video' && payload.video ? (
        <VideoLesson
          lessonId={payload.lesson.id}
          video={payload.video}
          title={payload.lesson.title}
          /*
            ⚠️ `payload.progress`, NOT the `progress` state, and not
            `isComplete` either.

            The effect above replaces that state with `postOpen()`'s answer,
            and `<VideoLesson>` reads this value inside the play handler — so a
            state read here resolves to whichever of the two values happened to
            have landed by the moment the student tapped, which is a race
            between a network round trip and a human finger. `payload` is what
            the server rendered the page from and it does not move under us.

            A finished lesson resumes at 0 on purpose: reopening a lesson you
            already completed is rewatching it, and dropping someone twenty
            seconds from the end of a video they have already seen is the
            opposite of helpful. `<VideoLesson>` treats 0 as "no resume" and
            draws the plain poster it always drew.
          */
          resumeAt={jumpTo ?? (payload.progress.completedAt != null ? 0 : payload.progress.maxPositionSeconds)}
          onProgress={onProgress}
          onError={onError}
          watermark={watermark}
        />
      ) : null}

      {/*
        A video lesson with NO `lesson_videos` row rendered nothing at all — a
        blank 16/9 space where the player belongs. It is a reachable state:
        `setVideo` 422s when YouTube will not state a duration, and an
        instructor who moved on after that has a published video lecture
        carrying no video. Saying so beats a hole in the page.
      */}
      {payload.lesson.kind === 'video' && !payload.video ? (
        <p
          role="status"
          className="flex aspect-video items-center justify-center rounded-md bg-surface-2 px-6 text-center text-[length:var(--fs-text-sm)] text-fg-muted"
        >
          {copy.player.videoMissing}
        </p>
      ) : null}

      {payload.lesson.kind === 'text' && payload.text ? (
        <TextLesson
          lessonId={payload.lesson.id}
          bodyHtml={payload.text.bodyHtml}
          alreadyComplete={isComplete}
          onProgress={onProgress}
        />
      ) : null}

      {payload.lesson.kind === 'attachment' ? (
        <AttachmentLesson
          lessonId={payload.lesson.id}
          resources={payload.resources}
          alreadyComplete={isComplete}
          onProgress={onProgress}
          watermark={watermark}
        />
      ) : null}

      {isQuiz ? <QuizLesson lessonId={payload.lesson.id} progress={progress} facts={payload.quiz} /> : null}

      {/* The one bar: title and place at the inline start, the controls at the end. */}
      <div className="lp-head">
        <div className="lp-head__text">
          <h1 className="lp-head__title">{payload.lesson.title}</h1>
          <div className="lp-head__meta">
            <span className="lp-unit">
              <Layers className="size-3.5" aria-hidden="true" />
              {h.unit.replace('{n}', String(place.unitIndex))}
              {place.unitTitle ? ` · ${place.unitTitle}` : ''}
            </span>
            {place.lectureIndex !== null && place.lectureCount > 0 ? (
              <span>
                {h.lessonOf
                  .replace('{n}', String(place.lectureIndex))
                  .replace('{m}', String(place.lectureCount))}
              </span>
            ) : null}
            {duration ? (
              <span className="mono tabular lp-head__time">{formatDuration(duration)}</span>
            ) : null}
          </div>
        </div>

        <LessonNav
          lessonId={payload.lesson.id}
          courseSlug={payload.lesson.courseSlug}
          previous={payload.previous}
          next={payload.next}
          isComplete={isComplete}
          // A quiz lesson is completed by passing its quiz, so it gets the
          // neighbour links without the finish button. `completeManually`
          // refuses one server-side too — this only stops us from drawing a
          // control whose press is now a 400.
          manualComplete={!isQuiz}
          undoable={undoable}
          // Three hints, not two. The quiz has its own rule and says it; the
          // other two are sentences about VIDEO.
          hint={
            isQuiz
              ? copy.player.quizAutoCompleteHint
              : payload.autoCompleteAvailable
                ? copy.player.autoCompleteHint
                : copy.player.manualOnlyHint
          }
          onProgress={onProgress}
          className="lp-head__actions"
        />
      </div>

      {saveFailed ? (
        <p role="status" className="text-[length:var(--fs-text-sm)] text-[color:var(--warn)]">
          {copy.player.saveFailed}
        </p>
      ) : null}

      {door}

      <LessonTabs tabs={tabs} label={t.label} />
    </div>
  );
}
