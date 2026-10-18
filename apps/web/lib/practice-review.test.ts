import { describe, expect, it } from 'vitest';
import type { ExternalBookPracticeResult } from '@ayman/contracts/quiz/external-books';
import { practiceReview } from './practice-review';

type Review = ExternalBookPracticeResult['review'][number];

function question(overrides: Partial<Review>): Review {
  return {
    slotPosition: 1,
    attemptQuestionId: '00000000-0000-4000-8000-000000000001',
    type: 'mcq_single',
    stemHtml: '<p>س</p>',
    options: [
      { id: 'a', bodyHtml: 'أ' },
      { id: 'b', bodyHtml: 'ب' },
    ],
    correctness: 'incorrect',
    mark: 0,
    maxMark: 1,
    ...overrides,
  };
}

describe('practiceReview', () => {
  it('numbers from 0, like the quiz engine — the API counts from 1', () => {
    const review = practiceReview({ review: [question({ slotPosition: 1 }), question({ slotPosition: 2 })] });
    expect(review.map((item) => item.slotPosition)).toEqual([0, 1]);
  });

  it('reads a bare array of ids — a cached result from before the fix — as a choice', () => {
    const [item] = practiceReview({ review: [question({ response: ['b'] })] });
    expect(item!.response).toEqual({ kind: 'choice', optionIds: ['b'] });
  });

  it('keeps the new shape as it is, and says a skipped question was skipped', () => {
    const [answered, skipped] = practiceReview({
      review: [question({ response: { kind: 'choice', optionIds: ['a'] } }), question({ response: [] })],
    });
    expect(answered!.response).toEqual({ kind: 'choice', optionIds: ['a'] });
    expect(skipped!.response).toBeNull();
  });

  it('shows an essay from an old session with no verdict and no mark — nobody marks a practice', () => {
    const [essay, mcq] = practiceReview({
      review: [
        question({ type: 'essay', options: [], correctness: 'needsGrading', mark: null, maxMark: 5 }),
        question({ correctness: 'correct', mark: 1 }),
      ],
    });
    expect(essay!.correctness).toBeUndefined();
    expect(essay!.mark).toBeUndefined();
    expect(essay!.maxMark).toBeUndefined();
    expect(mcq!.correctness).toBe('correct');
    expect(mcq!.mark).toBe(1);
  });

  it('drops a note that is only the explanation again', () => {
    const [item] = practiceReview({
      review: [question({ feedbackHtml: '<p>الشرح</p>', generalFeedbackHtml: '<p>الشرح</p>' })],
    });
    expect(item!.feedbackHtml).toBeUndefined();
    expect(item!.generalFeedbackHtml).toBe('<p>الشرح</p>');
  });
});
