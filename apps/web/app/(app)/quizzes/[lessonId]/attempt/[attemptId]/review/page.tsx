import { z } from 'zod';
import { QUESTION_TYPES, copy } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { AppealDialog } from '@/components/quiz/appeal-dialog';
import { AppealResolution } from '@/components/quiz/appeal-resolution';
import { ResultHeader } from '@/components/quiz/result-header';
import { ReviewLocked } from '@/components/quiz/review-locked';
import { ReviewQuestion } from '@/components/quiz/review-question';

const ReviewOptionSchema = z.object({ id: z.string(), bodyHtml: z.string() });

const AppealRowSchema = z.object({
  attemptQuestionId: z.string(),
  state: z.enum(['open', 'under_review', 'accepted', 'rejected']),
  gradeBefore: z.number(),
  gradeAfter: z.number().nullable(),
  resolverNote: z.string().nullable(),
});

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
    questions: z.array(ReviewQuestionSchema),
  }),
]);

export const metadata = { title: copy.quiz.reviewTitle };

/**
 * Not cached — the review window can flip (e.g. `immediatelyAfter` →
 * `laterWhileOpen`) between two loads of the same page, and a stale response
 * would show fields the student is no longer supposed to see (or hide ones
 * they now are).
 */
export default async function QuizReviewPage({
  params,
}: {
  params: Promise<{ lessonId: string; attemptId: string }>;
}) {
  const { attemptId } = await params;
  const review = await apiGetAuthed(`/api/quiz/attempts/${attemptId}/review`, ReviewPayloadSchema);

  // The appeal button needs to know "already open?" per question — a
  // second, small fetch rather than folding appeal state into the review
  // payload itself (which stays exactly what the 4x7 matrix produces).
  const appealRows = review.locked
    ? []
    : await apiGetAuthed(`/api/quiz/attempts/${attemptId}/appeals`, z.array(AppealRowSchema));
  const openAppealSlots = new Set(
    appealRows.filter((row) => row.state === 'open' || row.state === 'under_review').map((row) => row.attemptQuestionId),
  );
  const resolvedAppealBySlot = new Map(
    appealRows
      .filter((row) => row.state === 'accepted' || row.state === 'rejected')
      .map((row) => [row.attemptQuestionId, row]),
  );

  return (
    <main className="mx-auto max-w-[var(--w-prose)] px-6 py-10">
      <h1 className="mb-6 text-[length:var(--fs-title-2)] font-semibold">{copy.quiz.reviewTitle}</h1>

      {review.locked ? (
        <ReviewLocked reason={review.reason} />
      ) : (
        <div className="flex flex-col gap-6">
          <ResultHeader
            scaledScore={review.scaledScore}
            gradeOutOf={review.gradeOutOf}
            passPercent={review.passPercent}
            passed={review.passed}
            needsGrading={review.questions.some((question) => question.correctness === 'needsGrading')}
          />

          {review.questions.map((question) => {
            const resolved = resolvedAppealBySlot.get(question.attemptQuestionId);
            return (
              <ReviewQuestion
                key={question.slotPosition}
                question={question}
                appealSlot={
                  // Only where a mark is actually visible — appealing a
                  // question whose grade this window withholds makes no sense.
                  question.mark === undefined ? undefined : resolved ? (
                    <AppealResolution
                      gradeBefore={resolved.gradeBefore}
                      gradeAfter={resolved.gradeAfter}
                      resolverNote={resolved.resolverNote}
                    />
                  ) : (
                    <AppealDialog
                      attemptQuestionId={question.attemptQuestionId}
                      alreadyOpen={openAppealSlots.has(question.attemptQuestionId)}
                    />
                  )
                }
              />
            );
          })}
        </div>
      )}
    </main>
  );
}
