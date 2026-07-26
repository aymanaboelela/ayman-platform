'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { copy } from '@ayman/contracts';
import { Button } from '@ayman/ui';
import { apiPost } from '@/lib/api';
import { attemptHref } from '@/lib/quiz-links';

const StartResultSchema = z.object({ attemptId: z.string() });

export function StartAttemptButton({ lessonId, quizId }: { lessonId: string; quizId: string }) {
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
      {copy.quiz.start}
    </Button>
  );
}
