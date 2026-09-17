import type { AttemptQuestionState } from '../../../generated/prisma/enums';
import { splitMarks, splitPendingMarks } from './mark-split';

function question(state: AttemptQuestionState, maxMark: number) {
  return { state, maxMark };
}

/** امتحان نص السنة: 50 marks of MCQ the engine marks, 50 of essay he marks. */
const MIDTERM = { sumMarks: 100, gradeOutOf: 100 };

describe('splitMarks', () => {
  it('reports the auto-marked half out of 50, not out of 100', () => {
    const split = splitMarks(
      [
        question('graded_right', 25),
        question('graded_partial', 25),
        question('needs_grading', 30),
        question('needs_grading', 20),
      ],
      MIDTERM,
    );

    expect(split.pendingOutOf).toBe(50);
    expect(split.gradedOutOf).toBe(50);
  });

  it('returns nothing pending on a fully auto-marked paper', () => {
    const split = splitMarks(
      [question('graded_right', 10), question('graded_wrong', 10)],
      { sumMarks: 20, gradeOutOf: 100 },
    );

    // `gradedOutOf` is the whole total, so the results screen renders exactly
    // the undivided figure it always did.
    expect(split.pendingOutOf).toBe(0);
    expect(split.gradedOutOf).toBe(100);
  });

  it('rescales onto gradeOutOf rather than reporting paper marks', () => {
    // A 14-mark paper reported out of 100 — the shape 150 of 154 quizzes have.
    const split = splitMarks(
      [question('graded_right', 7), question('needs_grading', 7)],
      { sumMarks: 14, gradeOutOf: 100 },
    );

    expect(split.pendingOutOf).toBe(50);
    expect(split.gradedOutOf).toBe(50);
  });

  it('never lets the two halves add up to more than the total', () => {
    // Thirds: each half rounds to 33.3333, and two independent roundings can
    // sum to more than the whole. `gradedOutOf` is the remainder for exactly
    // this reason.
    const split = splitMarks(
      [question('graded_right', 1), question('needs_grading', 2)],
      { sumMarks: 3, gradeOutOf: 100 },
    );

    expect(split.gradedOutOf + split.pendingOutOf).toBe(100);
  });

  it('treats only needs_grading as pending, never an unanswered question', () => {
    // `gradeQuestion` scores a skipped question `graded_wrong` — 0 marks, but
    // DECIDED. Counting it as pending would tell the student that marks they
    // have already lost are still coming.
    const split = splitMarks(
      [question('graded_wrong', 50), question('graded_right', 50)],
      MIDTERM,
    );

    expect(split.pendingOutOf).toBe(0);
  });

  it('survives a quiz whose slots all failed to resolve', () => {
    // `sumMarks` 0 — dividing by it is Infinity, which would fail the
    // contract's own bounds and blank the results screen.
    const split = splitMarks([question('needs_grading', 5)], { sumMarks: 0, gradeOutOf: 100 });

    expect(split).toEqual({ gradedOutOf: 100, pendingOutOf: 0 });
  });
});

describe('splitPendingMarks', () => {
  it('agrees with splitMarks when given the same sum', () => {
    const questions = [question('needs_grading', 30), question('graded_right', 70)];
    const summed = questions
      .filter((q) => q.state === 'needs_grading')
      .reduce((total, q) => total + q.maxMark, 0);

    expect(splitPendingMarks(summed, MIDTERM)).toEqual(splitMarks(questions, MIDTERM));
  });

  it('clamps a pending share that exceeds the total', () => {
    // Reachable when a quiz's slots were edited after the paper was sat, so
    // the questions no longer add up to the attempt's `sumMarks` snapshot.
    const split = splitPendingMarks(200, MIDTERM);

    expect(split.pendingOutOf).toBe(100);
    expect(split.gradedOutOf).toBe(0);
  });
});
