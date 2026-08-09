'use client';

import { useCallback, useEffect, useState } from 'react';
import { copy, type HeartbeatResponse, type LessonPlayer } from '@ayman/contracts';
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

  return (
    <div className="space-y-6">
      {payload.lesson.kind === 'video' && payload.video ? (
        <VideoLesson
          lessonId={payload.lesson.id}
          video={payload.video}
          title={payload.lesson.title}
          onProgress={onProgress}
          onError={onError}
        />
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

      {payload.lesson.kind === 'quiz' ? <QuizLesson lessonId={payload.lesson.id} /> : null}

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

      <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
        {payload.autoCompleteAvailable ? copy.player.autoCompleteHint : copy.player.manualOnlyHint}
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
        onProgress={onProgress}
      />
    </div>
  );
}
