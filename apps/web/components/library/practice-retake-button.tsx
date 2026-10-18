'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw } from 'lucide-react';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { ExternalBookPracticeSessionSchema } from '@ayman/contracts/quiz/external-books';
import { cn } from '@ayman/ui/lib/cn';
import { apiPost } from '@/lib/api';
import { practiceHref } from '@/lib/practice-links';

/**
 * «تدريب جديد بأسئلة تانية» — the same scope, a fresh draw.
 *
 * A failure is said in place. It used to redirect to the book's page without
 * a word, which reads exactly like the button working and the practice
 * vanishing.
 */
export function PracticeRetakeButton({
  bookId,
  courseSlug,
  scope,
  scopeId,
  count,
}: {
  bookId: string;
  courseSlug: string;
  scope: 'book' | 'unit' | 'lesson';
  scopeId: string;
  count: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function retake() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const session = await apiPost(
        `/api/me/external-books/${encodeURIComponent(bookId)}/practice`,
        ExternalBookPracticeSessionSchema,
        { scope, scopeId, count: Math.min(50, Math.max(1, count)) },
      );
      router.push(practiceHref(courseSlug, bookId, session.sessionId));
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void retake()}
        disabled={pending}
        aria-busy={pending}
        className={cn('chip chip--solid', pending && 'opacity-80')}
      >
        {pending ? (
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <RotateCcw className="size-4" aria-hidden="true" />
        )}
        {pending ? quizExperience.practice.retaking : quizExperience.practice.retake}
      </button>
      {failed ? (
        <p role="alert" className="basis-full text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
          {quizExperience.practiceStart.failed}
        </p>
      ) : null}
    </>
  );
}
