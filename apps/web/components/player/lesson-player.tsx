'use client';

import { useCallback, useEffect, useState } from 'react';
import { copy } from '@ayman/contracts/copy';
import type { HeartbeatResponse, LessonPlayer } from '@ayman/contracts/progress';
import { postOpen } from '@/lib/progress-client';
import { AttachmentLesson } from './attachment-lesson';
import { LessonMaterials } from './lesson-materials';
import { LessonNav } from './lesson-nav';
import { QuizLesson } from './quiz-lesson';
import { TextLesson } from './text-lesson';
import { VideoLesson } from './video-lesson';

export interface LessonPlayerProps {
  payload: LessonPlayer;
}

export function LessonPlayerView({ payload }: LessonPlayerProps) {
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

  return (
    <div className="space-y-6">
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
          resumeAt={payload.progress.completedAt != null ? 0 : payload.progress.maxPositionSeconds}
          onProgress={onProgress}
          onError={onError}
        />
      ) : null}

      {/*
        A video lesson with NO `lesson_videos` row rendered nothing at all — a
        blank 16/9 space where the player belongs, no message, no logged error.
        It is a reachable state: `setVideo` 422s when YouTube will not state a
        duration, and an instructor who moved on after that has a published
        video lecture carrying no video.

        Saying so beats a hole in the page. The student cannot act on it, so it
        does not pretend they can — it names the situation and leaves the rest
        of the lesson (materials, the completion control) working.
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
        />
      ) : null}

      {payload.lesson.kind === 'quiz' ? (
        <QuizLesson lessonId={payload.lesson.id} progress={progress} />
      ) : null}

      {/*
        Every OTHER lesson kind can also carry materials — the deck it was
        taught from, tutorial videos, extra reading. That is the whole point of
        Plan 8: the predecessor could only hang files off `kind === 'attachment'`
        lessons, so the video lessons that most needed a presentation could not
        have one.

        `<LessonMaterials>` rather than `<AttachmentLesson>`: the latter starts
        a dwell timer that completes the lesson, which would be wrong here — a
        video lesson completes by earning its watch thresholds, not by having
        slides underneath it.
      */}
      {payload.lesson.kind !== 'attachment' && payload.resources.length > 0 ? (
        // Closed by default now. See `<LessonMaterials>` for why: a PDF that
        // renders itself under every video is a page nobody asked for.
        <LessonMaterials resources={payload.resources} />
      ) : null}

      {/*
        Three hints, not two. `autoCompleteHint` describes watch thresholds and
        `manualOnlyHint` describes a missing video duration — both are sentences
        about VIDEO, and a quiz lesson was being shown the second one purely
        because it is the `false` branch. It has its own rule and now says it.
      */}
      <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
        {isQuiz
          ? copy.player.quizAutoCompleteHint
          : payload.autoCompleteAvailable
            ? copy.player.autoCompleteHint
            : copy.player.manualOnlyHint}
      </p>

      {saveFailed ? (
        <p role="status" className="text-[length:var(--fs-text-sm)] text-[color:var(--warn)]">
          {copy.player.saveFailed}
        </p>
      ) : null}

      <LessonNav
        lessonId={payload.lesson.id}
        courseSlug={payload.lesson.courseSlug}
        previous={payload.previous}
        next={payload.next}
        isComplete={isComplete}
        // A quiz lesson is completed by passing its quiz, so it gets the
        // neighbour links without the finish button. `completeManually` refuses
        // one server-side too — this only stops us from drawing a control whose
        // press is now a 400.
        manualComplete={!isQuiz}
        onProgress={onProgress}
      />
    </div>
  );
}
