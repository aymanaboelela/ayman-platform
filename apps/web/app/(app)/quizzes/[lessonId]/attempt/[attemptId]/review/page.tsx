import { z } from 'zod';
import { QUESTION_TYPES, copy } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { ResultHeader } from '@/components/quiz/result-header';
import { ReviewLocked } from '@/components/quiz/review-locked';
import { ReviewList } from '@/components/quiz/review-list';

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

  // One request. There used to be a second, for per-question appeal state;
  // appeals are gone and the review payload is once again exactly what the
  // 4×7 matrix produces, with nothing bolted onto the side of it.

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

          <ReviewList questions={review.questions} />
        </div>
      )}
    </main>
  );
}
