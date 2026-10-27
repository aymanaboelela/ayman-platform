import type { QuizHistoryPoint } from '@ayman/contracts/quiz/history';
import type { GuardianPaper, GuardianPaperKind } from '@ayman/contracts/guardian-view';
import { splitPendingMarks } from '../quiz/grading/mark-split';

/**
 * The parent's marks, as a pure fold over the student's sittings — every rule
 * pinned by `guardian-scores.spec.ts` without a database.
 *
 * ## The four mistakes the old report made, and the rule that replaces each
 *
 * 1. **A paper being marked was invisible.** It read `state: 'submitted'`
 *    only, so a midterm with an essay on the teacher's desk did not exist on
 *    the parent's page at all — while the student's own screen showed it.
 *    Now a `pending_review` sitting is a row, reported out of what has been
 *    marked (`mark-split.ts`), and never as a mark.
 * 2. **The pass mark was re-derived** from the quiz's CURRENT `passPercent`
 *    with a `?? 70` fallback. A teacher raising the bar in December re-failed
 *    October's papers. The verdict is the engine's own `passed`, written at
 *    marking time against the bar the paper had when it was sat.
 * 3. **Every sitting was a separate exam.** A two-paper exam (original +
 *    تحسين) or a granted retake counted twice in «دخل كام امتحان», once as a
 *    fail and once as a pass. One row per quiz now; the best final sitting is
 *    the one that counts — the same `countingAttemptId` rule the quiz page
 *    uses, ties to the earlier sitting.
 * 4. **The average was per SITTING.** It is per quiz, over each quiz's best
 *    final mark, split quizzes / exams — exactly `CohortRankService`'s `best`
 *    CTE (`pct_final`), so the parent's average is the student's «ترتيبي».
 */

/** One sitting that reached the teacher — `submitted` or `pending_review`. */
export interface SittingRow {
  attemptId: string;
  attemptNo: number;
  lessonId: string;
  title: string;
  courseId: string;
  courseTitle: string;
  kind: GuardianPaperKind;
  state: 'submitted' | 'pending_review';
  submittedAt: Date;
  scaledScore: number | null;
  /** The attempt's own snapshot — what the student is shown marks out of. */
  gradeOutOf: number;
  /** The paper's own scale (the attempt's snapshot), for the pending share. */
  sumMarks: number;
  passed: boolean | null;
  /** Σ maxMark over the sitting's `needs_grading` answers, on the paper's scale. */
  pendingMarks: number;
}

export interface Averages {
  taken: number;
  average: number | null;
}

export interface ScoreFold {
  papers: GuardianPaper[];
  series: QuizHistoryPoint[];
  quizzes: Averages;
  exams: Averages;
  passed: number;
  failed: number;
  pending: number;
  byCourse: Map<string, { quizzes: Averages; exams: Averages }>;
}

/** How many fully-marked sittings the trend line carries — the latest. */
export const SERIES_LIMIT = 30;

/** Unrounded, clamped — the same expression as the rank SQL:
 *  `least(100, scaled_score / grade_out_of * 100)`, 0 on a zero scale. */
export function percentOf(score: number, outOf: number): number {
  if (!(outOf > 0)) return 0;
  return Math.min(100, Math.max(0, (score / outOf) * 100));
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
const round2 = (value: number): number => Math.round(value * 100) / 100;

function average(values: readonly number[]): Averages {
  if (values.length === 0) return { taken: 0, average: null };
  return { taken: values.length, average: round1(values.reduce((sum, n) => sum + n, 0) / values.length) };
}

const isExam = (kind: GuardianPaperKind): boolean => kind !== 'quiz';

export function foldScores(rows: readonly SittingRow[]): ScoreFold {
  const byLesson = new Map<string, SittingRow[]>();
  for (const row of rows) {
    const list = byLesson.get(row.lessonId) ?? [];
    list.push(row);
    byLesson.set(row.lessonId, list);
  }

  const papers: (GuardianPaper & { best: number | null })[] = [];
  for (const sittings of byLesson.values()) {
    // `attemptNo` order: the tie-break IS the order, same as `countingAttemptId`.
    const inOrder = [...sittings].sort((a, b) => a.attemptNo - b.attemptNo);
    const first = inOrder[0]!;

    let best: SittingRow | null = null;
    let bestPercent = -1;
    for (const sitting of inOrder) {
      if (sitting.state !== 'submitted' || sitting.scaledScore === null) continue;
      const percent = percentOf(sitting.scaledScore, sitting.gradeOutOf);
      if (percent > bestPercent) {
        best = sitting;
        bestPercent = percent;
      }
    }

    // The LATEST sitting still with the teacher, if any.
    const marking = [...inOrder].reverse().find((sitting) => sitting.state === 'pending_review') ?? null;
    const split = marking
      ? splitPendingMarks(marking.pendingMarks, { sumMarks: marking.sumMarks, gradeOutOf: marking.gradeOutOf })
      : null;

    const lastSubmittedAt = inOrder.reduce(
      (latest, sitting) => (sitting.submittedAt > latest ? sitting.submittedAt : latest),
      first.submittedAt,
    );

    papers.push({
      lessonId: first.lessonId,
      title: first.title,
      courseId: first.courseId,
      courseTitle: first.courseTitle,
      kind: first.kind,
      result: best
        ? {
            score: round2(best.scaledScore as number),
            outOf: round2(best.gradeOutOf),
            percent: Math.round(bestPercent),
            // A `submitted` sitting always carries a verdict; `=== true`
            // keeps a corrupt null from reading as a pass.
            passed: best.passed === true,
          }
        : null,
      pending:
        marking && split
          ? {
              gradedScore: round2(Math.max(0, marking.scaledScore ?? 0)),
              gradedOutOf: split.gradedOutOf,
              pendingOutOf: split.pendingOutOf,
            }
          : null,
      sittings: inOrder.length,
      lastSubmittedAt: lastSubmittedAt.toISOString(),
      best: best ? bestPercent : null,
    });
  }

  papers.sort((a, b) => b.lastSubmittedAt.localeCompare(a.lastSubmittedAt) || a.lessonId.localeCompare(b.lessonId));

  const finalOf = (filter: (paper: (typeof papers)[number]) => boolean) =>
    papers.filter((paper) => paper.best !== null && filter(paper)).map((paper) => paper.best as number);

  const byCourse = new Map<string, { quizzes: Averages; exams: Averages }>();
  for (const courseId of new Set(papers.map((paper) => paper.courseId))) {
    byCourse.set(courseId, {
      quizzes: average(finalOf((paper) => paper.courseId === courseId && !isExam(paper.kind))),
      exams: average(finalOf((paper) => paper.courseId === courseId && isExam(paper.kind))),
    });
  }

  // Three disjoint verdicts. A passed best stays passed whatever is being
  // marked (a pending answer can only raise a mark); otherwise a sitting on
  // the teacher's desk means «لسه بيتصحح», never a fail.
  let passed = 0;
  let failed = 0;
  let pending = 0;
  for (const paper of papers) {
    if (paper.result?.passed) passed += 1;
    else if (paper.pending) pending += 1;
    else if (paper.result) failed += 1;
  }

  const series: QuizHistoryPoint[] = rows
    .filter((row) => row.state === 'submitted' && row.scaledScore !== null)
    .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime() || a.attemptId.localeCompare(b.attemptId))
    .slice(-SERIES_LIMIT)
    .map((row) => ({
      attemptId: row.attemptId,
      lessonId: row.lessonId,
      quizTitle: row.title,
      attemptNo: row.attemptNo,
      scorePercent: Math.round(percentOf(row.scaledScore as number, row.gradeOutOf)),
      passed: row.passed,
      submittedAt: row.submittedAt.toISOString(),
    }));

  return {
    papers: papers.map(({ best: _best, ...paper }) => paper),
    series,
    quizzes: average(finalOf((paper) => !isExam(paper.kind))),
    exams: average(finalOf((paper) => isExam(paper.kind))),
    passed,
    failed,
    pending,
    byCourse,
  };
}
