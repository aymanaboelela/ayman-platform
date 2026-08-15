'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { copy } from '@ayman/contracts/copy';
import type { QuizPaper } from '@ayman/contracts/quiz/quiz-settings';
import { apiPost } from '@/lib/api';
import { attemptHref } from '@/lib/quiz-links';
import { ExamGateDialog } from './exam-gate-dialog';

const StartResultSchema = z.object({ attemptId: z.string() });

export interface StartAttemptButtonProps {
  lessonId: string;
  quizId: string;
  /** Which paper the server says the next sitting draws from. */
  paper: QuizPaper;
  allowsImprovement: boolean;
  durationSeconds: number | null;
}

/**
 * Opens the gate, and only then creates the attempt.
 *
 * The label comes from `paper`, NOT from a count of previous attempts. It used
 * to read "ادخل الامتحان تاني" whenever `attemptsUsed > 0`, which is a
 * different claim: an abandoned sitting makes that count non-zero without the
 * student having sat anything, and after the retake rules changed it would
 * offer "again" for a sitting that is actually a different paper. The server
 * already decides which paper is next; this renders that decision.
 */
export function StartAttemptButton({
  lessonId,
  quizId,
  paper,
  allowsImprovement,
  durationSeconds,
}: StartAttemptButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const result = await apiPost(`/api/quiz/quizzes/${quizId}/attempts`, StartResultSchema, {
        // Recorded onto the `attempt_started` event, so the acknowledgement
        // outlives the dialog that collected it.
        acknowledged: true,
      });
      router.push(attemptHref(lessonId, result.attemptId));
    } catch {
      /*
       * ⚠️ This `catch` is the whole point, and its absence was a real defect.
       *
       * The call used to be `try { … } finally { setPending(false) }`. On any
       * rejection — a 403 from the gate, a 429, a 500, a dropped connection —
       * the promise rejected into `void start()` at the call site, which
       * discards it. The spinner stopped, the dialog stayed open, and nothing
       * else changed on screen. Pressing «ابدأ الامتحان» simply did nothing,
       * forever, with no way for the student to find out why.
       *
       * It also never reached an error boundary: the rejection was swallowed
       * at the call site rather than thrown during render, so `(app)/error.tsx`
       * — which exists precisely to catch this class of failure — was never
       * given the chance.
       *
       * The message is deliberately not derived from the error. `apiPost`
       * rejects with the upstream status/body, and rendering that would put an
       * English HTTP string in front of a student mid-exam.
       */
      setError(copy.quiz.startFailed);
    } finally {
      setPending(false);
    }
  }

  const improving = paper === 'improvement';

  return (
    <>
      <button type="button" className="chip chip--solid" onClick={() => setOpen(true)}>
        {improving ? copy.quiz.improveExam : copy.quiz.start}
      </button>

      <ExamGateDialog
        open={open}
        // Clearing on close, so reopening the gate does not present a stale
        // failure from a previous attempt as if it had just happened.
        onOpenChange={(next) => {
          if (!next) setError(null);
          setOpen(next);
        }}
        paper={paper}
        allowsImprovement={allowsImprovement}
        durationSeconds={durationSeconds}
        pending={pending}
        error={error}
        onConfirm={() => void start()}
      />
    </>
  );
}
