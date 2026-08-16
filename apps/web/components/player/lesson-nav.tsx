'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { copy } from '@ayman/contracts/copy';
import type { HeartbeatResponse, LessonNeighbour } from '@ayman/contracts/progress';
import { Button } from '@ayman/ui/components/button';
import { cn } from '@ayman/ui/lib/cn';
import { postComplete } from '@/lib/progress-client';
import { CheckIcon, ChevronBack, ChevronForward } from './icons';

export interface LessonNavProps {
  lessonId: string;
  courseSlug: string;
  previous: LessonNeighbour;
  next: LessonNeighbour;
  isComplete: boolean;
  /**
   * Whether this lesson can be finished by pressing a button.
   *
   * True for every kind except `quiz`, which earns its completion by being
   * passed — see `LessonProgressService.completeManually`, which now rejects
   * one. Defaulted to true so the flag is opt-OUT: a new lesson kind keeps the
   * always-available finish path Global Constraint 14 asks for unless it has a
   * completion rule of its own.
   */
  manualComplete?: boolean;
  onProgress: (response: HeartbeatResponse) => void;
}

// `@ayman/ui`'s `Button` has no `asChild` prop, so the ghost-button look is
// applied directly to these `Link`s rather than nesting a `<button>` inside
// an `<a>`.
const GHOST_LINK = cn(
  'inline-flex h-10 items-center gap-2 rounded-sm px-4',
  'text-[length:var(--fs-text-base)] font-medium text-fg-muted',
  'transition-colors duration-[var(--d-hover)] ease-[var(--ease)] hover:bg-surface-3 hover:text-fg',
);

export function LessonNav({
  lessonId,
  courseSlug,
  previous,
  next,
  isComplete,
  manualComplete = true,
  onProgress,
}: LessonNavProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();

  const finish = async () => {
    setSaving(true);
    setFailed(false);
    try {
      onProgress(await postComplete(lessonId));
      // Advance immediately — "أنهيت الدرس · التالي" is one gesture, and
      // making the student find the next link afterwards is the single most
      // common complaint about these players.
      if (next) {
        startTransition(() => router.push(`/courses/${courseSlug}/lessons/${next.id}`));
      }
    } catch {
      /*
       * ⚠️ Without this `catch` the failure was completely silent, and it was
       * the worst possible kind of silent.
       *
       * `postComplete` rejects on any non-2xx or a dropped connection. The
       * rejection went into an async handler nobody awaits, so: the label went
       * back from «بنسجّل…» to «خلّصت», the progress row was never written, the
       * course percentage did not move, and — because the next lesson is gated
       * on this one's completion — the student was left on a lesson they had
       * finished, with the button apparently working and the course refusing
       * to advance. Nothing anywhere said why.
       *
       * Crucially the navigation is NOT attempted on failure. Advancing after
       * a failed write is what would make the gap invisible: the student ends
       * up further along with a hole in their progress they can only find
       * weeks later when the course will not reach 100%.
       */
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const label = saving
    ? copy.player.marking
    : next
      ? copy.player.markComplete
      : copy.player.markCompleteFinal;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-6">
      <div className="flex items-center gap-2">
        {previous ? (
          <Link href={`/courses/${courseSlug}/lessons/${previous.id}`} className={GHOST_LINK}>
            <ChevronBack />
            {copy.player.previous}
          </Link>
        ) : null}
        {next ? (
          <Link href={`/courses/${courseSlug}/lessons/${next.id}`} className={GHOST_LINK}>
            {copy.player.next}
            <ChevronForward />
          </Link>
        ) : null}
      </div>

      {/* Present on every lesson kind whose completion is the student's to
          declare — which is all of them except a quiz, where the mark is the
          completion and a button would be a way around sitting the exam. The
          finish path still never depends on WATCH progress, which is what the
          rule this replaces was actually protecting. */}
      {/* The whole block, not just the button. `failed` is only ever set by
          `finish()`, which nothing can call once the button is gone, so keeping
          the wrapper would leave an empty flex child on every quiz lesson —
          and `justify-between` on the row above would still be spacing against
          it. */}
      {manualComplete ? (
        <div className="flex flex-col items-end gap-2">
          <Button onClick={() => void finish()} disabled={saving || isComplete}>
            <span className="flex items-center gap-2">
              {isComplete ? <CheckIcon /> : null}
              {isComplete ? copy.player.completed : label}
            </span>
          </Button>

          {/* Directly under the button that failed, not a toast: the student is
              looking at the button, and the answer to "did that work?" has to be
              in the same place as the question. `role="alert"` announces it
              without stealing focus from the player. */}
          {failed ? (
            <p
              role="alert"
              aria-live="polite"
              className="text-[length:var(--fs-text-xs)] text-end"
              style={{ color: 'var(--err)' }}
            >
              {copy.player.markFailed}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
