import { gradeQuestion, type GradableQuestion } from './grade-question';

const option = (id: string, fraction: number, position: number) => ({ id, fraction, position });

function question(overrides: Partial<GradableQuestion>): GradableQuestion {
  return {
    type: 'mcq_single',
    options: [option('a', 1, 0), option('b', 0, 1)],
    caseSensitive: false,
    ...overrides,
  } as GradableQuestion;
}

describe('gradeQuestion — mcq_single / true_false', () => {
  it('takes the fraction of the chosen option verbatim', () => {
    const result = gradeQuestion(question({}), { kind: 'choice', optionIds: ['a'] });
    expect(result).toEqual({ fraction: 1, state: 'graded_right', matchedOptionIds: ['a'] });
  });

  it('awards partial credit when the chosen option carries it', () => {
    const q = question({ options: [option('a', 1, 0), option('b', 0.5, 1)] });
    expect(gradeQuestion(q, { kind: 'choice', optionIds: ['b'] })).toMatchObject({
      fraction: 0.5,
      state: 'graded_partial',
    });
  });

  it('passes a NEGATIVE fraction straight through — negative marking is per-option', () => {
    const q = question({ options: [option('a', 1, 0), option('b', -0.25, 1)] });
    expect(gradeQuestion(q, { kind: 'choice', optionIds: ['b'] })).toMatchObject({
      fraction: -0.25,
      state: 'graded_wrong',
    });
  });

  it('scores an unanswered question 0, not null', () => {
    expect(gradeQuestion(question({}), null)).toMatchObject({ fraction: 0, state: 'graded_wrong' });
  });

  it('ignores an option id that does not belong to this version', () => {
    expect(
      gradeQuestion(question({}), { kind: 'choice', optionIds: ['not-mine'] }),
    ).toMatchObject({ fraction: 0, state: 'graded_wrong' });
  });

  it('refuses to grade multiple selections on a single-choice question', () => {
    expect(
      gradeQuestion(question({}), { kind: 'choice', optionIds: ['a', 'b'] }),
    ).toMatchObject({ fraction: 0, state: 'graded_wrong' });
  });

  it('grades true_false identically to mcq_single', () => {
    const q = question({ type: 'true_false' });
    expect(gradeQuestion(q, { kind: 'choice', optionIds: ['a'] })).toMatchObject({ fraction: 1 });
  });
});

describe('gradeQuestion — mcq_multi', () => {
  const q = question({
    type: 'mcq_multi',
    options: [option('a', 0.5, 0), option('b', 0.5, 1), option('c', -0.5, 2), option('d', -0.5, 3)],
  });

  it('sums the ticked fractions', () => {
    expect(gradeQuestion(q, { kind: 'choice', optionIds: ['a'] })).toMatchObject({
      fraction: 0.5,
      state: 'graded_partial',
    });
  });

  it('awards full credit for both correct options', () => {
    expect(gradeQuestion(q, { kind: 'choice', optionIds: ['a', 'b'] })).toMatchObject({
      fraction: 1,
      state: 'graded_right',
    });
  });

  // THE CLAMP AT 0. Without it, ticking every distractor produces -1, which
  // subtracts from the rest of the paper — a student can end a quiz on a
  // negative total by guessing badly on one question.
  it('clamps a negative sum to 0', () => {
    expect(gradeQuestion(q, { kind: 'choice', optionIds: ['c', 'd'] })).toMatchObject({
      fraction: 0,
      state: 'graded_wrong',
    });
  });

  it('clamps at 0 exactly, not below', () => {
    expect(gradeQuestion(q, { kind: 'choice', optionIds: ['a', 'c', 'd'] }).fraction).toBe(0);
  });

  it('clamps a sum above 1 back to 1', () => {
    const generous = question({
      type: 'mcq_multi',
      options: [option('a', 0.8, 0), option('b', 0.8, 1)],
    });
    expect(gradeQuestion(generous, { kind: 'choice', optionIds: ['a', 'b'] }).fraction).toBe(1);
  });

  it('scores an empty selection 0', () => {
    expect(gradeQuestion(q, { kind: 'choice', optionIds: [] })).toMatchObject({ fraction: 0 });
  });

  it('reaches graded_right for ten 0.1 options despite the float sum', () => {
    const tenths = question({
      type: 'mcq_multi',
      options: Array.from({ length: 10 }, (_, i) => option(`o${i}`, 0.1, i)),
    });
    const result = gradeQuestion(tenths, {
      kind: 'choice',
      optionIds: Array.from({ length: 10 }, (_, i) => `o${i}`),
    });
    expect(result.state).toBe('graded_right');
  });
});

describe('gradeQuestion — short_answer', () => {
  const q = question({
    type: 'short_answer',
    options: [
      { id: 'p1', fraction: 1, position: 0, answerPattern: 'for' },
      { id: 'p2', fraction: 0.5, position: 1, answerPattern: 'for*' },
      { id: 'p3', fraction: 0, position: 2, answerPattern: '*' },
    ],
  });

  // FIRST MATCHING PATTERN WINS, in position order. 'for' and 'for*' both match
  // "for"; the answer must be the 1.0 one because it is listed first.
  it('takes the first matching pattern in position order', () => {
    expect(gradeQuestion(q, { kind: 'text', text: 'for' })).toMatchObject({
      fraction: 1,
      matchedOptionIds: ['p1'],
    });
  });

  it('falls through to a later pattern when the earlier one does not match', () => {
    expect(gradeQuestion(q, { kind: 'text', text: 'foreach' })).toMatchObject({
      fraction: 0.5,
      matchedOptionIds: ['p2'],
    });
  });

  it('uses the catch-all * pattern last', () => {
    expect(gradeQuestion(q, { kind: 'text', text: 'while' })).toMatchObject({
      fraction: 0,
      matchedOptionIds: ['p3'],
    });
  });

  it('scores 0 when nothing matches and there is no catch-all', () => {
    const strict = question({
      type: 'short_answer',
      options: [{ id: 'p1', fraction: 1, position: 0, answerPattern: 'for' }],
    });
    expect(gradeQuestion(strict, { kind: 'text', text: 'while' })).toMatchObject({
      fraction: 0,
      state: 'graded_wrong',
      matchedOptionIds: [],
    });
  });

  it('treats whitespace-only input as unanswered', () => {
    expect(gradeQuestion(q, { kind: 'text', text: '   ' })).toMatchObject({ fraction: 0 });
  });

  it('honours caseSensitive', () => {
    const sensitive = question({
      type: 'short_answer',
      caseSensitive: true,
      options: [{ id: 'p1', fraction: 1, position: 0, answerPattern: 'For' }],
    });
    expect(gradeQuestion(sensitive, { kind: 'text', text: 'for' }).fraction).toBe(0);
    expect(gradeQuestion(sensitive, { kind: 'text', text: 'For' }).fraction).toBe(1);
  });
});

describe('gradeQuestion — essay', () => {
  it('never auto-grades: fraction is null and the state is needs_grading', () => {
    const q = question({ type: 'essay', options: [] });
    expect(gradeQuestion(q, { kind: 'text', text: 'إجابة طويلة' })).toEqual({
      fraction: null,
      state: 'needs_grading',
      matchedOptionIds: [],
    });
  });

  it('still needs grading when the student wrote nothing — a human decides', () => {
    const q = question({ type: 'essay', options: [] });
    expect(gradeQuestion(q, null).state).toBe('needs_grading');
  });
});

describe('gradeQuestion — response/type mismatch', () => {
  it('scores a text response to a choice question 0 instead of throwing', () => {
    expect(gradeQuestion(question({}), { kind: 'text', text: 'a' })).toMatchObject({
      fraction: 0,
      state: 'graded_wrong',
    });
  });

  it('scores a choice response to a short answer 0 instead of throwing', () => {
    const q = question({
      type: 'short_answer',
      options: [{ id: 'p1', fraction: 1, position: 0, answerPattern: 'for' }],
    });
    expect(gradeQuestion(q, { kind: 'choice', optionIds: ['p1'] }).fraction).toBe(0);
  });
});
