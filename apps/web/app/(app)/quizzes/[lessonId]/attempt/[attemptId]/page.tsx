import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { copy } from '@ayman/contracts';
import { ApiSendError, apiSend, refusalReason } from '@/lib/api-server';
import { sanitizeRichText } from '@/lib/sanitize-html';
import { StartedAttemptSchema, type StartedAttempt } from '@/components/quiz/attempt-schema';
import { QuizRunner } from '@/components/quiz/quiz-runner';

export const metadata = { title: copy.quiz.resultsTitle };

/**
 * NEVER reused from the client router cache, and on this route that is a
 * correctness rule rather than a freshness preference.
 *
 * `next.config.ts` gives every dynamic route a 30-second stale time so that
 * leaving a page and coming back does not re-render it from scratch. This route
 * cannot take it, because — uniquely in this app — its server render is a WRITE:
 * the `resume` POST below rotates the attempt token and returns the server's
 * current deadline. Replaying a cached payload of it hands the runner a
 * SNAPSHOT of the attempt as it was up to half a minute ago.
 *
 * The path that costs is short and ordinary. «الخروج من الامتحان» flushes the
 * last answers and replaces to the quiz page; «كمّل امتحانك» there is a
 * `<Link>`, so tapping it inside the window is a soft navigation that replays
 * the PRE-FLUSH payload — the answers just saved come back blank, and autosave
 * then writes those blanks over the good ones. Losing a student's answers to a
 * cache is not a trade this app makes.
 *
 * `0`, not a `router.refresh()` in `quiz-runner.tsx`: a refresh there would
 * re-render THIS route and re-post `resume`, which is the reason that component
 * deliberately has none. The rule belongs to the page that must not be reused,
 * where it holds for every caller — see its ⚠️, and the sibling export on
 * `quizzes/[lessonId]/page.tsx`.
 *
 * ⚠️ Page files only — Next rejects this export on a layout.
 */
export const unstable_dynamicStaleTime = 0;

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
    if (error instanceof ApiSendError) {
      if (error.status === 401) {
        redirect(`/login?next=${encodeURIComponent(`/quizzes/${lessonId}/attempt/${attemptId}`)}`);
      }
      if (error.status === 404) {
        notFound();
      }
      /*
       * A refusal is an ordinary answer here, and it is the one production
       * recorded most: the 17:00 wave on `/admin/errors` was students
       * reopening their paper the minute the exam window shut, and `resume`
       * answering `quiz_closed`. That used to throw — an error screen with a
       * digest, over a paper whose answers were already safely saved. Each
       * reason now gets its own sentence on this route (see
       * `AttemptUnavailable`); the review page is no answer to «closed»,
       * because a paper that was never handed in has nothing to review yet.
       */
      if (error.status === 403) {
        return <AttemptUnavailable lessonId={lessonId} reason={refusalReason(error.payload)} />;
      }
      if (error.status === 400) {
        redirect(`/quizzes/${encodeURIComponent(lessonId)}/attempt/${encodeURIComponent(attemptId)}/review`);
      }
    }
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

/** Spelled as the API spells them — see `QuizRefused` on the exam page. */
const LAPSED_REASONS = new Set(['expired', 'revoked', 'not_yet_valid']);

/**
 * The runner's page when `resume` refused, one sentence per reason:
 *
 *   · `quiz_closed`        — «الامتحان قفل», and the true thing about the
 *                            answers: autosaved, on the server, with their
 *                            outcome on the exam page once the sweep is done.
 *   · `quiz_not_open_yet`  — the window was moved later after the paper was
 *                            started; the exam page shows when it opens.
 *   · a lapsed grant       — the subscription ran out.
 *   · anything else        — the subscription does not cover this exam.
 *
 * The first two point at the exam page; the last two at the student's
 * courses, where the renewal lives. Never the not-found page, and never an
 * error screen — every one of these is an answer, not a fault.
 */
function AttemptUnavailable({ lessonId, reason }: { lessonId: string; reason: string | null }) {
  const c = copy.quiz;
  const windowShut = reason === 'quiz_closed' || reason === 'quiz_not_open_yet';
  const title =
    reason === 'quiz_closed' ? c.closed : reason === 'quiz_not_open_yet' ? c.notOpenYet : c.blockedTitle;
  const body =
    reason === 'quiz_closed'
      ? c.closedSavedBody
      : windowShut
        ? null
        : reason !== null && LAPSED_REASONS.has(reason)
          ? c.lockedLapsed
          : c.lockedNotIncluded;

  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
      <header className="stage mb-6">
        <div className="stage__body">
          <h1 className="stage__title">{title}</h1>
          {body ? <p className="stage__sub">{body}</p> : null}
          <div className="exam-stage__action">
            {windowShut ? (
              <Link href={`/quizzes/${encodeURIComponent(lessonId)}`} className="chip chip--solid">
                {c.toQuizPage}
              </Link>
            ) : (
              <Link href="/library" className="chip chip--solid">
                {copy.library.title}
              </Link>
            )}
          </div>
        </div>
      </header>
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
