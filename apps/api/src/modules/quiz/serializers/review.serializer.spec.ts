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
    gradedAt: new Date('2026-07-26T12:00:00Z'),
    version: {
      id: 'v1',
      type: 'mcq_single',
      stemHtml: '<p>س</p>',
      generalFeedbackHtml: '<p>SECRET general</p>',
      options: [
        { id: 'opt-a', bodyHtml: '<p>أ</p>', position: 0, fraction: 1 },
        { id: 'opt-b', bodyHtml: '<p>ب</p>', position: 1, fraction: 0 },
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

  // I9 regression: the correct option used to be identified by joining every
  // correct option's stripped body with `copy.quiz.answerListSeparator`
  // («، ») into `rightAnswerText`, then RE-SPLITTING that string on the
  // client to match option bodies by text. That round trip breaks the
  // instant an option's own body contains the separator — an ordinary
  // Arabic list comma — because splitting produces a fragment that can
  // equal a DIFFERENT option's full text. Shipping `rightAnswerOptionIds`
  // straight off the frozen version's `fraction` field removes the
  // round trip: the correct set is identified by id, never by re-parsed prose.
  describe('rightAnswerOptionIds carries the correct set by id, not by re-split text (I9)', () => {
    const flags = { ...resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'afterClose'), rightAnswer: true };

    it('is present, by id, for a choice question when the rightAnswer flag is on', () => {
      const result = toReviewQuestion(row, flags);
      expect(result.rightAnswerOptionIds).toEqual(['opt-a']);
    });

    it('is absent when the rightAnswer flag is off', () => {
      const off = { ...flags, rightAnswer: false };
      expect(toReviewQuestion(row, off)).not.toHaveProperty('rightAnswerOptionIds');
    });

    it('is absent for short_answer/essay — there is no correct OPTION set, only a pattern or nothing', () => {
      const shortAnswerRow: ReviewRow = {
        ...row,
        rightAnswerText: 'ال*',
        version: { ...row.version, type: 'short_answer' },
      };
      expect(toReviewQuestion(shortAnswerRow, flags)).not.toHaveProperty('rightAnswerOptionIds');
    });

    it('picks the correct option by id even when a WRONG option`s text contains the list separator, exactly matching the correct option`s stripped text', () => {
      // The exact scenario the audit reproduced: distractor B's body, once
      // stripped of markup, equals the FIRST fragment you get by splitting
      // correct option A's body on the separator. A text-based re-split
      // match highlights B (wrong); an id-based match highlights A (right).
      const separatorRow: ReviewRow = {
        ...row,
        response: { kind: 'choice', optionIds: ['opt-b'] },
        rightAnswerText: 'القاهرة، الإسكندرية',
        version: {
          ...row.version,
          type: 'mcq_single',
          options: [
            { id: 'opt-a', bodyHtml: '<p>القاهرة، الإسكندرية</p>', position: 0, fraction: 1 },
            { id: 'opt-b', bodyHtml: '<p>القاهرة</p>', position: 1, fraction: 0 },
          ],
        },
      };

      const result = toReviewQuestion(separatorRow, flags);

      // The correct id is A — the option that actually carries credit —
      // never B, even though B's stripped text equals the first half of A's
      // joined `rightAnswerText` once split on the Arabic list separator.
      expect(result.rightAnswerOptionIds).toEqual(['opt-a']);
      expect(result.rightAnswerOptionIds).not.toContain('opt-b');
    });

    it('lists every option carrying positive credit, for a multi-select question', () => {
      const multiRow: ReviewRow = {
        ...row,
        version: {
          ...row.version,
          type: 'mcq_multi',
          options: [
            { id: 'opt-a', bodyHtml: '<p>أ</p>', position: 0, fraction: 0.5 },
            { id: 'opt-b', bodyHtml: '<p>ب</p>', position: 1, fraction: 0.5 },
            { id: 'opt-c', bodyHtml: '<p>ج</p>', position: 2, fraction: 0 },
          ],
        },
      };
      const result = toReviewQuestion(multiRow, flags);
      expect(result.rightAnswerOptionIds).toEqual(['opt-a', 'opt-b']);
    });
  });

  // B4 regression: practice mode's `during` window has `generalFeedback:
  // true` by default (DEFAULT_REVIEW_OPTIONS_PRACTICE), and `review()` has no
  // `submittedAt`/`state` predicate — so an attempt in its very first second,
  // before the student has answered a single question, used to resolve to
  // `window: 'during'` and ship every question's model-answer explanation.
  describe('generalFeedbackHtml is gated per-question, not by the window flag alone (B4)', () => {
    const unansweredUngraded: ReviewRow = { ...row, response: null, gradedAt: null };

    it('is ABSENT before the student has answered or the question has been graded', () => {
      const flags = { ...resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'during'), generalFeedback: true };
      const result = toReviewQuestion(unansweredUngraded, flags);
      expect(result).not.toHaveProperty('generalFeedbackHtml');
      expect(JSON.stringify(result)).not.toContain('SECRET general');
    });

    it('is present once the student has answered, even before grading', () => {
      const answeredUngraded: ReviewRow = {
        ...row,
        response: { kind: 'choice', optionIds: ['opt-a'] },
        gradedAt: null,
      };
      const flags = { ...resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'during'), generalFeedback: true };
      expect(toReviewQuestion(answeredUngraded, flags)).toHaveProperty('generalFeedbackHtml');
    });

    it('is present once the question has been graded, even with a null response', () => {
      const gradedNoResponse: ReviewRow = { ...row, response: null, gradedAt: new Date() };
      const flags = { ...resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'during'), generalFeedback: true };
      expect(toReviewQuestion(gradedNoResponse, flags)).toHaveProperty('generalFeedbackHtml');
    });

    it('stays absent regardless of the gate when the flag itself is off', () => {
      const flags = resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'during');
      expect(toReviewQuestion(row, flags)).not.toHaveProperty('generalFeedbackHtml');
    });
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

  it('labels a null response `unanswered`, never `incorrect`, even though it is graded_wrong (0 marks)', () => {
    // `gradeQuestion` deliberately scores a skipped question as
    // `graded_wrong` — 0 is the only correct MARK for it. But the label
    // shown to the student has to stay honest: "you didn't answer this",
    // not "you answered this wrong" (a real bug found via manual browser
    // verification — the label used to collapse straight to `incorrect`).
    const unansweredRow: ReviewRow = { ...row, response: null, state: 'graded_wrong', mark: 0 };
    const flags = resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'afterClose');
    const result = toReviewQuestion(unansweredRow, flags);
    expect(result.correctness).toBe('unanswered');
    expect(result.mark).toBe(0);
  });

  it('still reduces a genuinely wrong (non-null) response to `incorrect`', () => {
    const wrongRow: ReviewRow = {
      ...row,
      response: { kind: 'choice', optionIds: ['opt-b'] },
      state: 'graded_wrong',
      mark: 0,
    };
    const flags = resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'afterClose');
    expect(toReviewQuestion(wrongRow, flags).correctness).toBe('incorrect');
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
