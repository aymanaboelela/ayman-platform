import { notFound } from 'next/navigation';
import { copy } from '@ayman/contracts';
import { apiSend } from '@/lib/api-server';
import { sanitizeRichText } from '@/lib/sanitize-html';
import { StartedAttemptSchema, type StartedAttempt } from '@/components/quiz/attempt-schema';
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
      <QuizRunner lessonId={lessonId} initial={sanitizePaper(initial)} />
    </main>
  );
}

/**
 * The second sanitization pass, run ONCE per page load instead of once per
 * render — which on this screen is once per keystroke.
 *
 * `<QuestionView>` used to call `<RichText>` for the stem and for every option,
 * and `<RichText>` sanitized inside render. `QuizRunner` holds the answers at
 * the top of its tree, so a single character typed into an essay re-rendered
 * the question card and paid `DOMPurify.sanitize()` 1 + N times — each of which
 * builds a DOM, walks it and serialises it back. That is «بيلاج وأنا بحل
 * الامتحان», and it is worst on exactly the phones this platform is for.
 *
 * Nothing about the security posture changes: the same allowlist runs over the
 * same strings, on the server, before the markup crosses to the browser. What
 * changes is that it runs N+1 times per attempt rather than N+1 times per
 * keystroke, and that `isomorphic-dompurify` stops being shipped to the phone
 * at all (28,635 bytes on this route — see `lib/sanitize-html.ts`).
 *
 * Every html-bearing field on `StartedAttempt` is covered: the stem and each
 * option body. If a field is added to `attempt-schema.ts` that carries markup,
 * it has to be added here — the schema is the list, and `QuestionView` can no
 * longer sanitize on its own behalf.
 */
function sanitizePaper(paper: StartedAttempt): StartedAttempt {
  return {
    ...paper,
    questions: paper.questions.map((question) => ({
      ...question,
      stemHtml: sanitizeRichText(question.stemHtml),
      options: question.options.map((option) => ({
        ...option,
        bodyHtml: sanitizeRichText(option.bodyHtml),
      })),
    })),
  };
}
