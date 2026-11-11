import type { AdminAttemptRow } from '@ayman/contracts/admin/attempts';

/** One exam this student sat, with every sitting of it, newest first. */
export interface ExamGroup {
  quizId: string;
  /** The newest sitting — what the card's mark and actions are about. */
  latest: AdminAttemptRow;
  /** Every sitting, newest first (`latest` is `attempts[0]`). */
  attempts: AdminAttemptRow[];
}

export interface ExamSummary {
  /** Distinct exams sat. */
  sat: number;
  /** Mean of the LATEST fully-marked sitting's percent, per exam; `null` when
   *  none is marked yet. */
  average: number | null;
  /** Exams whose latest marked sitting passed. */
  passed: number;
  /** Sittings waiting on an essay mark. */
  pending: number;
}

/**
 * Sittings → one group per exam, ordered by each exam's newest sitting.
 *
 * Grouped because «امتحاناته» is a list of EXAMS: three sittings of the same
 * monthly exam are one row with a history, not three rows that read like
 * three exams. The input order is not trusted — `startedAt` decides newest,
 * with the attempt number as the tiebreak two sittings stamped in the same
 * instant need.
 */
export function groupAttemptsByExam(rows: readonly AdminAttemptRow[]): ExamGroup[] {
  const sorted = [...rows].sort(
    (a, b) => b.startedAt.localeCompare(a.startedAt) || b.attemptNumber - a.attemptNumber,
  );
  const byQuiz = new Map<string, AdminAttemptRow[]>();
  for (const row of sorted) {
    const list = byQuiz.get(row.quizId);
    if (list) list.push(row);
    else byQuiz.set(row.quizId, [row]);
  }
  return [...byQuiz.entries()].map(([quizId, attempts]) => ({ quizId, latest: attempts[0]!, attempts }));
}

/**
 * The strip over the list. «Latest», not «best»: the question in a chat is
 * where the student stands now, and a best-ever mark from before a fail is
 * the number that hides it.
 */
export function summarizeExams(groups: readonly ExamGroup[]): ExamSummary {
  const marked = groups.map((group) => group.latest).filter((row) => row.percent !== null);
  return {
    sat: groups.length,
    average:
      marked.length > 0 ? marked.reduce((sum, row) => sum + (row.percent ?? 0), 0) / marked.length : null,
    passed: marked.filter((row) => row.passed === true).length,
    pending: groups.reduce(
      (sum, group) => sum + group.attempts.filter((row) => row.state === 'pending_review').length,
      0,
    ),
  };
}
