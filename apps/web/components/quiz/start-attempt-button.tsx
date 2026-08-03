'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { copy } from '@ayman/contracts';
import { Button } from '@ayman/ui';
import { apiPost } from '@/lib/api';
import { attemptHref } from '@/lib/quiz-links';

const StartResultSchema = z.object({ attemptId: z.string() });

/**
 * Creates an attempt and sends the student into the runner.
 *
 * `attemptsUsed` decides the label. It read "ابدأ الامتحان" on every sitting —
 * the first and the fourth — which quietly hides the one fact a student
 * retaking an exam is looking for: that this is a retake, not the original.
 * `copy.quiz.retryQuiz` says so.
 */
export function StartAttemptButton({
  lessonId,
  quizId,
  attemptsUsed,
}: {
  lessonId: string;
  quizId: string;
  attemptsUsed: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    try {
      const result = await apiPost(`/api/quiz/quizzes/${quizId}/attempts`, StartResultSchema, {});
      router.push(attemptHref(lessonId, result.attemptId));
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" onClick={() => void start()} disabled={pending}>
      {attemptsUsed > 0 ? copy.quiz.retryQuiz : copy.quiz.start}
    </Button>
  );
}
