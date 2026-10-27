import { describe, expect, it } from '@jest/globals';
import { foldScores, type SittingRow } from './guardian-scores';

let seq = 0;
function sitting(over: Partial<SittingRow> = {}): SittingRow {
  seq += 1;
  return {
    attemptId: `a-${seq}`,
    attemptNo: 1,
    lessonId: 'q-1',
    title: 'كويز ١',
    courseId: 'c-1',
    courseTitle: 'البرمجة',
    kind: 'quiz',
    state: 'submitted',
    submittedAt: new Date(`2026-09-${String(10 + seq).padStart(2, '0')}T10:00:00Z`),
    scaledScore: 80,
    gradeOutOf: 100,
    sumMarks: 20,
    passed: true,
    pendingMarks: 0,
    ...over,
  };
}

/**
 * The marks a parent reads. Each case is one of the four ways the old report
 * got a number wrong — see the header of `guardian-scores.ts`.
 */
describe('foldScores', () => {
  it('scores a paper out of its own total — 47 of 50 is 94%, not 47%', () => {
    const fold = foldScores([sitting({ scaledScore: 47, gradeOutOf: 50 })]);
    expect(fold.papers[0]!.result).toEqual({ score: 47, outOf: 50, percent: 94, passed: true });
    expect(fold.quizzes).toEqual({ taken: 1, average: 94 });
  });

  it('takes the verdict the engine wrote, not a pass mark re-derived today', () => {
    // 75% with `passed: false` — the quiz's bar was 80 when it was sat. The old
    // report re-read the CURRENT bar (or 70 when unset) and called it a pass.
    const fold = foldScores([sitting({ scaledScore: 75, passed: false })]);
    expect(fold.papers[0]!.result?.passed).toBe(false);
    expect([fold.passed, fold.failed]).toEqual([0, 1]);
  });

  it('counts a two-paper exam once, by its better FINAL sitting', () => {
    const fold = foldScores([
      sitting({ lessonId: 'ex', kind: 'final', attemptNo: 1, scaledScore: 40, passed: false }),
      sitting({ lessonId: 'ex', kind: 'final', attemptNo: 2, scaledScore: 72, passed: true }),
    ]);
    expect(fold.papers).toHaveLength(1);
    expect(fold.papers[0]).toMatchObject({ sittings: 2, result: { percent: 72, passed: true } });
    expect(fold.exams).toEqual({ taken: 1, average: 72 });
    expect(fold.quizzes).toEqual({ taken: 0, average: null });
    expect([fold.passed, fold.failed, fold.pending]).toEqual([1, 0, 0]);
    // The trend line still shows both sittings — they both happened.
    expect(fold.series.map((point) => point.scorePercent)).toEqual([40, 72]);
  });

  it('a tie goes to the earlier sitting, like the quiz page’s «اللي بتتحسب»', () => {
    const fold = foldScores([
      sitting({ lessonId: 'ex', attemptNo: 2, scaledScore: 60, gradeOutOf: 100, passed: true }),
      sitting({ lessonId: 'ex', attemptNo: 1, scaledScore: 30, gradeOutOf: 50, passed: true }),
    ]);
    // Both are 60%; attempt 1 (30 of 50) is the one reported.
    expect(fold.papers[0]!.result).toMatchObject({ score: 30, outOf: 50 });
  });

  it('shows a paper being marked as being marked — out of what was marked, never as a fail', () => {
    // 100-mark midterm: 50 MCQ marked (48.5), 50 marks of essay on the desk.
    // `scaledScore` already counts the essay as 0 and `passed` says false.
    const fold = foldScores([
      sitting({
        lessonId: 'mid',
        kind: 'monthly',
        state: 'pending_review',
        scaledScore: 48.5,
        gradeOutOf: 100,
        sumMarks: 40,
        pendingMarks: 20,
        passed: false,
      }),
    ]);
    const paper = fold.papers[0]!;
    expect(paper.result).toBeNull();
    expect(paper.pending).toEqual({ gradedScore: 48.5, gradedOutOf: 50, pendingOutOf: 50 });
    expect([fold.passed, fold.failed, fold.pending]).toEqual([0, 0, 1]);
    // No provisional number reaches an average or the trend line.
    expect(fold.exams).toEqual({ taken: 0, average: null });
    expect(fold.series).toEqual([]);
  });

  it('keeps a passed original passed while its improvement is being marked', () => {
    const fold = foldScores([
      sitting({ lessonId: 'ex', kind: 'final', attemptNo: 1, scaledScore: 70, passed: true }),
      sitting({ lessonId: 'ex', kind: 'final', attemptNo: 2, state: 'pending_review', scaledScore: 20, pendingMarks: 5 }),
    ]);
    expect(fold.papers[0]).toMatchObject({ result: { percent: 70, passed: true } });
    expect(fold.papers[0]!.pending).not.toBeNull();
    expect([fold.passed, fold.failed, fold.pending]).toEqual([1, 0, 0]);
  });

  it('averages per quiz, not per sitting, and splits quizzes from exams', () => {
    const fold = foldScores([
      // Quiz A sat twice (granted retake): best 90 counts once.
      sitting({ lessonId: 'A', attemptNo: 1, scaledScore: 50 }),
      sitting({ lessonId: 'A', attemptNo: 2, scaledScore: 90 }),
      sitting({ lessonId: 'B', scaledScore: 61, courseId: 'c-2', courseTitle: 'الفيزياء' }),
      sitting({ lessonId: 'M', kind: 'monthly', scaledScore: 33, gradeOutOf: 40 }),
    ]);
    // (90 + 61) / 2 = 75.5 — the per-sitting mean would have been 67.
    expect(fold.quizzes).toEqual({ taken: 2, average: 75.5 });
    expect(fold.exams).toEqual({ taken: 1, average: 82.5 });
    expect(fold.byCourse.get('c-1')).toEqual({
      quizzes: { taken: 1, average: 90 },
      exams: { taken: 1, average: 82.5 },
    });
    expect(fold.byCourse.get('c-2')!.quizzes).toEqual({ taken: 1, average: 61 });
  });

  it('never divides by a zero scale', () => {
    const fold = foldScores([sitting({ scaledScore: 0, gradeOutOf: 0, passed: false })]);
    expect(fold.papers[0]!.result?.percent).toBe(0);
    expect(fold.series[0]!.scorePercent).toBe(0);
  });

  it('lists the most recently sat paper first', () => {
    const fold = foldScores([
      sitting({ lessonId: 'old', submittedAt: new Date('2026-09-01T00:00:00Z') }),
      sitting({ lessonId: 'new', submittedAt: new Date('2026-10-01T00:00:00Z') }),
    ]);
    expect(fold.papers.map((paper) => paper.lessonId)).toEqual(['new', 'old']);
    expect(fold.series.map((point) => point.lessonId)).toEqual(['old', 'new']);
  });

  it('has no average at all before the first paper — never a zero', () => {
    const fold = foldScores([]);
    expect(fold.quizzes.average).toBeNull();
    expect(fold.exams.average).toBeNull();
    expect(fold.papers).toEqual([]);
  });
});
