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

  async function start() {
    setPending(true);
    try {
      const result = await apiPost(`/api/quiz/quizzes/${quizId}/attempts`, StartResultSchema, {
        // Recorded onto the `attempt_started` event, so the acknowledgement
        // outlives the dialog that collected it.
        acknowledged: true,
      });
      router.push(attemptHref(lessonId, result.attemptId));
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
        onOpenChange={setOpen}
        paper={paper}
        allowsImprovement={allowsImprovement}
        durationSeconds={durationSeconds}
        pending={pending}
        onConfirm={() => void start()}
      />
    </>
  );
}
