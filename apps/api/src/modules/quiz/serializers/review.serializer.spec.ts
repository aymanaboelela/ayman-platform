import { DEFAULT_REVIEW_OPTIONS_GRADED } from '@ayman/contracts/quiz/quiz-settings';
import {
  IMMEDIATELY_AFTER_SECONDS,
  resolveReviewFlags,
  resolveReviewWindow,
  toReviewQuestion,
  type ReviewRow,
} from './review.serializer';

describe('resolveReviewWindow', () => {
  const now = new Date('2026-07-26T12:00:00Z');

  it('is `during` while the attempt is unsubmitted', () => {
    expect(resolveReviewWindow({ submittedAt: null, openUntil: null, now })).toBe('during');
  });

  it("is `immediatelyAfter` for 120 seconds after submission — Moodle's constant", () => {
    expect(IMMEDIATELY_AFTER_SECONDS).toBe(120);
    expect(
      resolveReviewWindow({ submittedAt: new Date(now.getTime() - 119_000), openUntil: null, now }),
    ).toBe('immediatelyAfter');
  });

  it('flips to `laterWhileOpen` at exactly 120 seconds', () => {
    expect(
      resolveReviewWindow({ submittedAt: new Date(now.getTime() - 120_000), openUntil: null, now }),
    ).toBe('laterWhileOpen');
  });

  it('stays `laterWhileOpen` forever when the quiz has no close date', () => {
    expect(
      resolveReviewWindow({
        submittedAt: new Date(now.getTime() - 400 * 24 * 3600 * 1000),
        openUntil: null,
        now,
      }),
    ).toBe('laterWhileOpen');
  });

  it('is `afterClose` once openUntil has passed', () => {
    expect(
      resolveReviewWindow({
        submittedAt: new Date(now.getTime() - 3600_000),
        openUntil: new Date(now.getTime() - 1000),
        now,
      }),
    ).toBe('afterClose');
  });

  it('prefers `immediatelyAfter` over `afterClose` in the 120s straddle', () => {
    // A student who submits in the final seconds still gets their result page.
    expect(
      resolveReviewWindow({
        submittedAt: new Date(now.getTime() - 10_000),
        openUntil: new Date(now.getTime() - 5000),
        now,
      }),
    ).toBe('immediatelyAfter');
  });
});

describe('toReviewQuestion', () => {
  const row: ReviewRow = {
    id: 'aq-1',
    slotPosition: 0,
    optionOrder: [0, 1],
    response: { kind: 'choice', optionIds: ['opt-a'] },
    mark: 1,
    maxMark: 1,
    state: 'graded_right',
    feedbackHtml: '<p>SECRET feedback</p>',
    rightAnswerText: 'أ',
    version: {
      id: 'v1',
      type: 'mcq_single',
      stemHtml: '<p>س</p>',
      generalFeedbackHtml: '<p>SECRET general</p>',
      options: [
        { id: 'opt-a', bodyHtml: '<p>أ</p>', position: 0 },
        { id: 'opt-b', bodyHtml: '<p>ب</p>', position: 1 },
      ],
    },
  };

  it('OMITS every disallowed field rather than nulling it', () => {
    const allFalse = resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'during');
    const result = toReviewQuestion(row, allFalse);
    expect(result).not.toHaveProperty('correctness');
    expect(result).not.toHaveProperty('mark');
    expect(result).not.toHaveProperty('rightAnswerText');
    expect(result).not.toHaveProperty('feedbackHtml');
    expect(result).not.toHaveProperty('generalFeedbackHtml');
    expect(result).not.toHaveProperty('response');
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });

  it.each([
    ['response', 'response'],
    ['correctness', 'correctness'],
    ['marks', 'mark'],
    ['specificFeedback', 'feedbackHtml'],
    ['generalFeedback', 'generalFeedbackHtml'],
    ['rightAnswer', 'rightAnswerText'],
  ])('flag %s controls field %s independently', (flag, field) => {
    const flags = { ...resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'during'), [flag]: true };
    const result = toReviewQuestion(row, flags as never);
    expect(result).toHaveProperty(field);

    const without = toReviewQuestion(row, { ...flags, [flag]: false } as never);
    expect(without).not.toHaveProperty(field);
  });

  it('never sends the fraction, even when marks are allowed', () => {
    const flags = resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'afterClose');
    const result = toReviewQuestion(row, flags);
    expect(result).not.toHaveProperty('fraction');
    expect(result.mark).toBeDefined();
  });

  it('reduces correctness to a coarse label, not the raw grading state', () => {
    const flags = resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'afterClose');
    expect(['correct', 'partial', 'incorrect', 'needsGrading', 'unanswered']).toContain(
      toReviewQuestion(row, flags).correctness,
    );
  });

  it('preserves the snapshotted option order, same as the learner serializer', () => {
    const reversedRow: ReviewRow = { ...row, optionOrder: [1, 0] };
    const flags = resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'afterClose');
    const result = toReviewQuestion(reversedRow, flags);
    expect(result.options.map((option) => option.id)).toEqual(['opt-b', 'opt-a']);
  });

  it('always includes the base question shape regardless of the flags', () => {
    const allFalse = resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'during');
    const result = toReviewQuestion(row, allFalse);
    expect(result.stemHtml).toBe('<p>س</p>');
    expect(result.options).toHaveLength(2);
  });

  it('always includes attemptQuestionId, unconditionally — the appeal button needs it and it is not answer data', () => {
    const allFalse = resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'during');
    expect(toReviewQuestion(row, allFalse).attemptQuestionId).toBe('aq-1');
  });
});
