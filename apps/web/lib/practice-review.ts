import type { ReviewQuestion } from '@ayman/contracts/quiz/attempt';
import type { ExternalBookPracticeResult } from '@ayman/contracts/quiz/external-books';

/**
 * A book practice's review, in the shape the quiz review components read.
 *
 * The practice API grew its own copy of the review payload and three things
 * about it disagreed with the screen that renders it (`ReviewQuestion`):
 *
 *   · `slotPosition` is 1-based there and 0-based everywhere in the quiz
 *     engine, so every card was numbered one too high — «سؤال 2» on the first;
 *   · `response` was a bare array of option ids, where the review reads
 *     `{ kind: 'choice', optionIds }` — so the student's own pick was never
 *     marked, on the one screen whose point is showing it;
 *   · the answer's note fell back to the question's general explanation,
 *     which the review then printed twice, under two headings.
 *
 * The API now sends the right shape, but a result is cached for a week, so the
 * mapping lives here and accepts both.
 *
 * And `needsGrading` means something else here. On an exam it is an essay
 * waiting for the teacher («لسه عند … للتصحيح»); a practice has no grader, so
 * nobody ever will — it is only an essay in a session from before essays left
 * the pool. It goes out with no verdict and no mark: not wrong, not pending,
 * and not counted by the list's «غلطت فين؟».
 */
export function practiceReview(result: Pick<ExternalBookPracticeResult, 'review'>): ReviewQuestion[] {
  return result.review.map((question, index) => {
    const response = normaliseResponse(question.response);
    const feedbackHtml =
      question.feedbackHtml && question.feedbackHtml !== question.generalFeedbackHtml
        ? question.feedbackHtml
        : undefined;

    return {
      slotPosition: index,
      questionId: question.attemptQuestionId,
      attemptQuestionId: question.attemptQuestionId,
      type: question.type,
      stemHtml: question.stemHtml,
      options: question.options,
      // `null` — present but empty — rather than absent: the review shows
      // «من غير إجابة» for a present-and-empty response and nothing at all for
      // an absent one, and a skipped practice question should say so.
      response,
      ...(question.correctness === 'needsGrading'
        ? {}
        : { correctness: question.correctness, mark: question.mark, maxMark: question.maxMark }),
      ...(feedbackHtml ? { feedbackHtml } : {}),
      ...(question.generalFeedbackHtml ? { generalFeedbackHtml: question.generalFeedbackHtml } : {}),
      ...(question.rightAnswerText ? { rightAnswerText: question.rightAnswerText } : {}),
      ...(question.rightAnswerOptionIds ? { rightAnswerOptionIds: question.rightAnswerOptionIds } : {}),
    };
  });
}

function normaliseResponse(raw: unknown): ReviewQuestion['response'] {
  if (Array.isArray(raw)) {
    const optionIds = raw.filter((id): id is string => typeof id === 'string');
    return optionIds.length > 0 ? { kind: 'choice', optionIds } : null;
  }
  if (raw && typeof raw === 'object') return raw;
  return null;
}
