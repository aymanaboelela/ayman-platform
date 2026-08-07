import { notFound } from 'next/navigation';
import { copy } from '@ayman/contracts';
import { apiSend } from '@/lib/api-server';
import { StartedAttemptSchema } from '@/components/quiz/attempt-schema';
import { QuizRunner } from '@/components/quiz/quiz-runner';

export const metadata = { title: copy.quiz.resultsTitle };

/**
 * Calls `resume()` on EVERY visit — a fresh navigation right after "Start",
 * a hard reload, or reopening the tab after a disconnect all land here and
 * all get the identical treatment: the same snapshotted questions and
 * option order, a rotated token (killing whatever tab held the previous
 * one), and the server's current `deadlineAt`/`serverTime` pair. This is
 * what makes the disconnect-and-resume drill work from a plain page load,
 * with no special-cased "first visit" branch.
 */
export default async function QuizAttemptPage({
  params,
}: {
  params: Promise<{ lessonId: string; attemptId: string }>;
}) {
  const { lessonId, attemptId } = await params;

  let initial;
  try {
    initial = await apiSend('POST', `/api/quiz/attempts/${attemptId}/resume`, StartedAttemptSchema);
  } catch (error) {
    // `apiSend` (Server Action helper) throws a plain `Error` carrying the
    // status in its message, not `ApiRequestError` — that type is
    // `apiGetAuthed`'s own, a different helper in the same file.
    if (error instanceof Error && error.message.includes('failed with 404')) notFound();
    throw error;
  }

  return (
    // Matching the rest of the study surface's page padding (`px-4` on a
    // phone, not `px-6`) — the runner is the one screen a student is in for
    // half an hour, and 24px of gutter on a 360px viewport was taken straight
    // out of the question's own reading width.
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
      <QuizRunner lessonId={lessonId} initial={initial} />
    </main>
  );
}
