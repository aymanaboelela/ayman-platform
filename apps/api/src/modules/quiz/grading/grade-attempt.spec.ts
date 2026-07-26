import { gradeAttempt } from './grade-attempt';

const quiz = { sumMarks: 10, gradeOutOf: 100, passPercent: 70 };

describe('gradeAttempt', () => {
  it('multiplies each fraction by that question\'s max mark', () => {
    const result = gradeAttempt(
      [
        { fraction: 1, maxMark: 4, minFraction: 0, maxFraction: 1, state: 'graded_right' },
        { fraction: 0.5, maxMark: 6, minFraction: 0, maxFraction: 1, state: 'graded_partial' },
      ],
      quiz,
    );
    expect(result.rawScore).toBe(7);
    expect(result.scaledScore).toBe(70);
    expect(result.passed).toBe(true);
  });

  it('fails one mark below the pass line', () => {
    const result = gradeAttempt(
      [{ fraction: 0.69, maxMark: 10, minFraction: 0, maxFraction: 1, state: 'graded_partial' }],
      quiz,
    );
    expect(result.scaledScore).toBe(69);
    expect(result.passed).toBe(false);
  });

  it('passes exactly on the pass line', () => {
    const result = gradeAttempt(
      [{ fraction: 0.7, maxMark: 10, minFraction: 0, maxFraction: 1, state: 'graded_partial' }],
      quiz,
    );
    expect(result.passed).toBe(true);
  });

  // The per-question floor. A -0.25 option on a 4-mark question is -1 mark;
  // minFraction stops it from eating the rest of the paper beyond its own worth.
  it('applies the per-question minFraction floor', () => {
    const result = gradeAttempt(
      [
        { fraction: -0.25, maxMark: 4, minFraction: 0, maxFraction: 1, state: 'graded_wrong' },
        { fraction: 1, maxMark: 6, minFraction: 0, maxFraction: 1, state: 'graded_right' },
      ],
      quiz,
    );
    expect(result.rawScore).toBe(6);
  });

  it('allows a negative question mark when minFraction permits it, but floors the ATTEMPT at 0', () => {
    const result = gradeAttempt(
      [
        { fraction: -1, maxMark: 4, minFraction: -1, maxFraction: 1, state: 'graded_wrong' },
        { fraction: 0, maxMark: 6, minFraction: 0, maxFraction: 1, state: 'graded_wrong' },
      ],
      quiz,
    );
    expect(result.rawScore).toBe(0);
  });

  it('counts an ungraded essay as 0 for now and marks the attempt pending_review', () => {
    const result = gradeAttempt(
      [
        { fraction: 1, maxMark: 5, minFraction: 0, maxFraction: 1, state: 'graded_right' },
        { fraction: null, maxMark: 5, minFraction: 0, maxFraction: 1, state: 'needs_grading' },
      ],
      quiz,
    );
    expect(result.rawScore).toBe(5);
    expect(result.needsGrading).toBe(true);
    expect(result.attemptState).toBe('pending_review');
  });

  it('marks a fully auto-graded attempt as submitted', () => {
    const result = gradeAttempt(
      [{ fraction: 1, maxMark: 10, minFraction: 0, maxFraction: 1, state: 'graded_right' }],
      quiz,
    );
    expect(result.attemptState).toBe('submitted');
    expect(result.needsGrading).toBe(false);
  });

  it('scores an empty paper 0 without dividing by zero', () => {
    const result = gradeAttempt([], { sumMarks: 0, gradeOutOf: 100, passPercent: 70 });
    expect(result.rawScore).toBe(0);
    expect(result.scaledScore).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('rounds the scaled score to five places rather than carrying float noise', () => {
    const result = gradeAttempt(
      [{ fraction: 1 / 3, maxMark: 3, minFraction: 0, maxFraction: 1, state: 'graded_partial' }],
      { sumMarks: 3, gradeOutOf: 100, passPercent: 70 },
    );
    expect(result.scaledScore).toBe(33.33333);
  });
});
