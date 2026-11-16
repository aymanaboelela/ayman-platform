import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { z } from 'zod';
import { LearningPathSchema, QUESTION_TYPES, StudentQuizHistorySchema, copy } from '@ayman/contracts';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { ApiRequestError } from '@/lib/api';
import { apiGetAuthed } from '@/lib/api-server';
import { getBrandAsset } from '@/lib/brand-assets';
import { quizHref } from '@/lib/quiz-links';
import { historyRowFor, mistakeRows, nextStepAfter, reviewTally } from '@/lib/review-view';
import { sanitizeRichText } from '@/lib/sanitize-html';
import { ReviewActions, ReviewMistakes, ReviewStats, type ReviewPrimary } from '@/components/quiz/review-board';
import { ReviewHero } from '@/components/quiz/review-hero';
import { ReviewLocked } from '@/components/quiz/review-locked';
import { ReviewList } from '@/components/quiz/review-list';
import { ResultShareSlot } from '@/components/share-card/share-slots';
import '@/components/quiz/review-cinema.css';

const ReviewOptionSchema = z.object({ id: z.string(), bodyHtml: z.string() });

const ReviewQuestionSchema = z.object({
  slotPosition: z.number(),
  questionId: z.string(),
  attemptQuestionId: z.string(),
  type: z.enum(QUESTION_TYPES),
  stemHtml: z.string(),
  options: z.array(ReviewOptionSchema),
  response: z.unknown().optional(),
  correctness: z.enum(['correct', 'partial', 'incorrect', 'needsGrading', 'unanswered']).optional(),
  mark: z.number().nullable().optional(),
  maxMark: z.number().optional(),
  feedbackHtml: z.string().optional(),
  generalFeedbackHtml: z.string().optional(),
  rightAnswerText: z.string().optional(),
  // I9: the correct options' own ids, structured — the review UI highlights
  // the correct option by id membership, never by re-splitting
  // `rightAnswerText` back apart on the Arabic list separator.
  rightAnswerOptionIds: z.array(z.string()).optional(),
});

const ReviewPayloadSchema = z.discriminatedUnion('locked', [
  z.object({ locked: z.literal(true), reason: z.enum(['during', 'awaitingClose']) }),
  z.object({
    locked: z.literal(false),
    attemptId: z.string(),
    window: z.enum(['during', 'immediatelyAfter', 'laterWhileOpen', 'afterClose']),
    rawScore: z.number().nullable(),
    scaledScore: z.number().nullable(),
    gradeOutOf: z.number(),
    sumMarks: z.number(),
    passPercent: z.number(),
    passed: z.boolean().nullable(),
    /* Marks still with the instructor, out of `gradeOutOf`. `.catch(0)` and
       not merely `.default(0)`: this page is served by whichever API
       container answers, and during a rolling deploy that is briefly one
       without the field. A missing value degrades to the old undivided
       screen (`needsGrading` still drives the softer copy); it must never
       fail the parse and take the student's result page down with it. */
    pendingOutOf: z.number().catch(0),
    gradedOutOf: z.number().catch(0),
    questions: z.array(ReviewQuestionSchema),
  }),
]);

export const metadata = { title: copy.quiz.reviewTitle };

/**
 * Not cached — the review window can flip (e.g. `immediatelyAfter` →
 * `laterWhileOpen`) between two loads of the same page, and a stale response
 * would show fields the student is no longer supposed to see (or hide ones
 * they now are).
 *
 * ## «نتيجة الامتحان» — the 2026-11 board, top to bottom
 *
 * The result (`ReviewHero`: a celebration on a pass, a calm way forward under
 * the line, no verdict while an essay is being marked) → صح / غلط → the
 * questions worth revisiting, each jumping to its card → the actions, with at
 * most ONE orange button → the share card → the full paper (`#answers`).
 *
 * The board's «الوقت» tile and its per-topic card are NOT drawn: no endpoint
 * carries time taken or a question's topic, and the owner's rule is real data
 * or nothing.
 */
export default async function QuizReviewPage({
  params,
}: {
  params: Promise<{ lessonId: string; attemptId: string }>;
}) {
  const { lessonId, attemptId } = await params;

  /*
   * The 404 is an ORDINARY answer here, not a fault — and this page was the one
   * screen in the quiz flow that did not say so.
   *
   * `AttemptService.review` answers 404 for four states a student reaches by
   * walking, not by breaking anything: an attempt id that is not theirs, one
   * that no longer exists, and — through `requireOwnership` — an enrolment that
   * was revoked or a lesson/course that was unpublished after they sat it. The
   * instructor unpublishing a lesson for ten minutes to edit it puts every
   * student holding a review link into that last branch.
   *
   * Without this catch `apiGetAuthed` threw `ApiRequestError` straight through
   * the Server Component render, so the student got the generic «فيه حاجة
   * بايظة» boundary — and `useErrorReport` posted it to `/admin/errors` as a
   * server fault. That is how six of those rows arrived: one person, one
   * revoked link, six presses of «حاول تاني», and a fault log describing an
   * outage that never happened.
   *
   * `notFound()` instead: the student gets the real answer, and the error log
   * goes back to meaning something. Same shape as the quiz intro page and the
   * admin lesson page, which have always done this.
   */
  let review;
  try {
    review = await apiGetAuthed(`/api/quiz/attempts/${attemptId}/review`, ReviewPayloadSchema);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 401) {
        redirect(`/login?next=${encodeURIComponent(`/quizzes/${lessonId}/attempt/${attemptId}/review`)}`);
      }
      if (error.status === 403 || error.status === 404) {
        notFound();
      }
    }
    throw error;
  }

  // The review itself is still ONE request, and still the only one that can
  // fail this page. Appeals used to add a second; they are gone, and the
  // review payload is exactly what the 4×7 matrix produces.
  if (review.locked) {
    return (
      <main className="rvc mx-auto w-full px-4 py-8 md:px-6 md:py-10">
        <BackToQuiz lessonId={lessonId} />
        <h1 className="rvc-h1">{copy.quiz.reviewTitle}</h1>
        <ReviewLocked reason={review.reason} />
      </main>
    );
  }

  /*
   * Two reads for the board's dressing, both from endpoints the student's own
   * screens already use, and both allowed to fail: a missing title or a
   * missing «المحاضرة الجاية» is a smaller screen, never an error page.
   *
   *   · `/api/me/quizzes` — the quiz's title (the review payload carries
   *     none) and whether an improvement sitting is still open, the same two
   *     flags `/results` reads for its «دخول امتحان التحسين».
   *   · `/api/me/path` — the course's `nextLessonId`, the same pointer «مسارك»
   *     and the course page follow, so the orange button cannot disagree
   *     with them.
   */
  const [history, path] = await Promise.all([
    apiGetAuthed('/api/me/quizzes', StudentQuizHistorySchema).catch(() => null),
    apiGetAuthed('/api/me/path', LearningPathSchema).catch(() => null),
  ]);

  const row = historyRowFor(history?.quizzes ?? null, lessonId);
  const questions = review.questions.map(sanitizeReviewQuestion);
  const needsGrading = questions.some((question) => question.correctness === 'needsGrading');
  const outstanding = review.pendingOutOf > 0 || needsGrading;
  const tally = reviewTally(questions);
  const mistakes = mistakeRows(questions);
  const next = nextStepAfter(path, lessonId, row?.courseSlug ?? null);
  const hasAnswers = questions.length > 0;

  /*
   * The ONE orange button. A failed paper with its improvement sitting still
   * unused gets that sitting — both flags, as on `/results`, because neither
   * implies the other. Otherwise the next stop on the path; and when there is
   * none, reviewing the answers IS the next thing to do.
   */
  const canImprove = row !== null && row.allowsImprovement && !row.improvementUsed;
  const primary: ReviewPrimary =
    !outstanding && review.passed === false && canImprove
      ? { kind: 'improve', href: quizHref(lessonId) }
      : next && review.passed !== false
        ? { kind: 'next', step: next }
        : hasAnswers
          ? { kind: 'review' }
          : next
            ? { kind: 'next', step: next }
            : null;

  return (
    <main className="rvc mx-auto w-full px-4 py-8 md:px-6 md:py-10">
      <BackToQuiz lessonId={lessonId} />
      <h1 className="rvc-h1">{copy.quiz.reviewTitle}</h1>

      <div className="rvc-stack">
        {/* `gradedOutOf || gradeOutOf`: a payload from an API container that
            predates the split carries 0, and falling back to the quiz's own
            total renders exactly the screen this page always did rather than
            «٤٨٫٥ / ٠». */}
        <ReviewHero
          scaledScore={review.scaledScore}
          gradeOutOf={review.gradeOutOf}
          passPercent={review.passPercent}
          passed={review.passed}
          needsGrading={needsGrading}
          pendingOutOf={review.pendingOutOf}
          gradedOutOf={review.gradedOutOf || review.gradeOutOf}
          title={row?.quizTitle ?? null}
          poster={getBrandAsset('practiceGuide')}
        />

        {tally ? <ReviewStats tally={tally} /> : null}

        <ReviewMistakes rows={mistakes} />

        <ReviewActions primary={primary} next={next} hasAnswers={hasAnswers} />

        {/* «كارت النتيجة» — only on a FINAL mark: a card printed while an
            essay is still waiting for the teacher would show a score that
            is about to change. The API says the same (404), this just skips
            the round trip. Streams in after the score; see the slot. */}
        {review.pendingOutOf > 0 ? null : (
          <Suspense fallback={null}>
            <ResultShareSlot attemptId={attemptId} />
          </Suspense>
        )}

        {hasAnswers ? (
          <section id="answers" className="rvc-answers" aria-labelledby="rvc-answers-title">
            <h2 id="rvc-answers-title" className="rvc-h2">
              {copy.quiz.reviewBoard.answersTitle}
            </h2>
            {/* Sanitized HERE, once, rather than inside `<ReviewQuestion>` on
                every render — see `sanitizeReviewQuestion` below. */}
            <ReviewList questions={questions} anchorPrefix="q-" />
          </section>
        ) : null}
      </div>
    </main>
  );
}

/** The way back to the exam's own page — where the attempt history lives.
 *  There was none except the browser's. */
function BackToQuiz({ lessonId }: { lessonId: string }) {
  return (
    <Link href={quizHref(lessonId)} className="quiz-back mb-2">
      <ArrowRight className="size-4" aria-hidden="true" />
      {quizExperience.review.backToQuiz}
    </Link>
  );
}

/**
 * The second sanitization pass over one reviewed question, run once on the
 * server instead of once per render inside `<ReviewQuestion>`.
 *
 * This screen paid the old arrangement hardest. `<ReviewQuestion>` called
 * `<RichText>` five times — the stem, every option twice (the answer list and
 * the correct-answer list), the per-question feedback and the general feedback
 * — and `<RichText>` sanitized in render, so a twenty-question paper ran
 * roughly a hundred `DOMPurify.sanitize()` calls on mount, and the whole set
 * again every time «وريني غلطاتي بس» was toggled. Each of those builds a DOM,
 * walks it and serialises it back.
 *
 * The allowlist is unchanged and still runs on every string before it reaches
 * the browser; only the number of times it runs does. `lib/sanitize-html.ts`
 * carries the full account, including the 28,635 bytes of `dompurify` this
 * takes off the phone.
 *
 * ⚠️ Every optional html field is listed. `feedbackHtml` and
 * `generalFeedbackHtml` are `.optional()` on the schema above, so they are
 * mapped only when present — passing `undefined` through `sanitizeRichText`
 * would return the string `"undefined"` and print it to the student.
 */
function sanitizeReviewQuestion(
  question: z.infer<typeof ReviewQuestionSchema>,
): z.infer<typeof ReviewQuestionSchema> {
  return {
    ...question,
    stemHtml: sanitizeRichText(question.stemHtml),
    options: question.options.map((option) => ({
      ...option,
      bodyHtml: sanitizeRichText(option.bodyHtml),
    })),
    ...(question.feedbackHtml === undefined
      ? {}
      : { feedbackHtml: sanitizeRichText(question.feedbackHtml) }),
    ...(question.generalFeedbackHtml === undefined
      ? {}
      : { generalFeedbackHtml: sanitizeRichText(question.generalFeedbackHtml) }),
  };
}
