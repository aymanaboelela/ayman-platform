import { Injectable } from '@nestjs/common';
import type {
  QuizHistoryPoint,
  QuizHistoryRow,
  StudentQuizHistory,
} from '@ayman/contracts';
import { PrismaService } from '../../prisma/prisma.service';

/** One row of the flat attempt query, before it is folded into quizzes. */
interface AttemptRow {
  id: string;
  attemptNo: number;
  submittedAt: Date;
  scaledScore: number;
  gradeOutOf: number;
  passed: boolean | null;
  lessonId: string;
  quizTitle: string;
  courseTitle: string;
  courseSlug: string;
  allowsImprovement: boolean;
  paper: 'original' | 'improvement';
}

/**
 * The student's own quiz results, across every quiz they have sat.
 *
 * ## Ownership
 *
 * `userId` is in the WHERE clause of the only query here, and the route that
 * calls this takes no id parameter at all — the identity comes from the
 * session and nothing else. That is the same discipline `DashboardController`
 * documents and the cheapest possible defence against IDOR: there is nothing
 * to tamper with.
 *
 * ## Why one query and not three
 *
 * Every figure on the results page — the summary, the trend series, and the
 * per-quiz rows — is a different fold over the SAME set of rows: this
 * student's submitted attempts. Issuing a `groupBy` for the summary, a
 * `findMany` for the series and another for the rows would be three round
 * trips that can disagree with each other if an attempt is submitted between
 * them. Folding one ordered result set in memory cannot.
 *
 * The set is bounded by how many exams a student sits in a year, so this is
 * not a table scan waiting to happen; the `[userId, quizId]` index already on
 * `quiz_attempts` serves the filter.
 */
@Injectable()
export class QuizHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string): Promise<StudentQuizHistory> {
    const attempts = await this.prisma.quizAttempt.findMany({
      // `submittedAt: { not: null }` is what makes this a history rather than a
      // work-in-progress list: an abandoned or still-running attempt has no
      // score to report and must not dilute an average.
      where: { userId, submittedAt: { not: null } },
      orderBy: { submittedAt: 'asc' },
      select: {
        id: true,
        attemptNo: true,
        submittedAt: true,
        scaledScore: true,
        gradeOutOf: true,
        passed: true,
        paper: true,
        quiz: {
          select: {
            allowsImprovement: true,
            lesson: {
              select: { id: true, title: true, course: { select: { title: true, slug: true } } },
            },
          },
        },
      },
    });

    const rows: AttemptRow[] = attempts.map((attempt) => ({
      id: attempt.id,
      attemptNo: attempt.attemptNo,
      // Non-null by the WHERE clause above; Prisma's type cannot express that.
      submittedAt: attempt.submittedAt!,
      scaledScore: Number(attempt.scaledScore ?? 0),
      // `gradeOutOf` is snapshotted onto the ATTEMPT at start, never re-read
      // from the quiz. An instructor who rescales the quiz afterwards must not
      // retroactively change what a student scored — see the column's own
      // comment in schema.prisma.
      gradeOutOf: Number(attempt.gradeOutOf),
      passed: attempt.passed,
      lessonId: attempt.quiz.lesson.id,
      quizTitle: attempt.quiz.lesson.title,
      courseTitle: attempt.quiz.lesson.course.title,
      courseSlug: attempt.quiz.lesson.course.slug,
      allowsImprovement: attempt.quiz.allowsImprovement,
      paper: attempt.paper,
    }));

    return {
      summary: summarise(rows),
      series: rows.map(toPoint),
      quizzes: foldIntoQuizzes(rows),
    };
  }
}

/**
 * A score as a percentage of what the attempt was actually marked out of.
 *
 * `gradeOutOf` can legitimately be 0 for a quiz whose slots all failed to
 * resolve — dividing by it would produce `Infinity` or `NaN`, either of which
 * fails the contract's `.max(100)` and takes the whole page down with a parse
 * error rather than showing a 0.
 */
function percentOf(row: AttemptRow): number {
  if (row.gradeOutOf <= 0) return 0;
  const raw = (row.scaledScore / row.gradeOutOf) * 100;
  return Math.round(Math.min(Math.max(raw, 0), 100));
}

function toPoint(row: AttemptRow): QuizHistoryPoint {
  return {
    attemptId: row.id,
    lessonId: row.lessonId,
    quizTitle: row.quizTitle,
    attemptNo: row.attemptNo,
    scorePercent: percentOf(row),
    passed: row.passed,
    submittedAt: row.submittedAt.toISOString(),
  };
}

/**
 * Per-quiz rows, most recently sat first.
 *
 * `rows` arrives oldest-first, so the LAST row seen for a lesson is the latest
 * attempt — which is why `latest*` is overwritten on every visit while `best`
 * takes a max. Reversing the sort at the end rather than querying `desc` keeps
 * "the last one wins" true while it is being folded.
 */
function foldIntoQuizzes(rows: readonly AttemptRow[]): QuizHistoryRow[] {
  const byLesson = new Map<string, QuizHistoryRow>();

  for (const row of rows) {
    const percent = percentOf(row);
    const existing = byLesson.get(row.lessonId);

    if (!existing) {
      byLesson.set(row.lessonId, {
        lessonId: row.lessonId,
        quizTitle: row.quizTitle,
        courseTitle: row.courseTitle,
        courseSlug: row.courseSlug,
        attemptsUsed: 1,
        allowsImprovement: row.allowsImprovement,
        improvementUsed: row.paper === 'improvement',
        bestPercent: percent,
        latestPercent: percent,
        latestAttemptId: row.id,
        passed: row.passed,
        lastSubmittedAt: row.submittedAt.toISOString(),
      });
      continue;
    }

    existing.attemptsUsed += 1;
    if (row.paper === 'improvement') existing.improvementUsed = true;
    existing.bestPercent = Math.max(existing.bestPercent ?? 0, percent);
    existing.latestPercent = percent;
    existing.latestAttemptId = row.id;
    existing.lastSubmittedAt = row.submittedAt.toISOString();
    // `passed` tracks the BEST sitting, not the latest: the higher of the two
    // is what counts, so a student who passed the original has passed, and a
    // weaker improvement sitting does not un-pass them.
    if (row.passed === true) existing.passed = true;
    else if (existing.passed === null) existing.passed = row.passed;
  }

  return [...byLesson.values()].sort((a, b) => b.lastSubmittedAt.localeCompare(a.lastSubmittedAt));
}

/**
 * `improvementUsed` here is derived from the sittings this student has
 * ACTUALLY SUBMITTED, so it can read more optimistic than the quiz page's own
 * figure — `QuizAccessService` additionally counts in-progress and abandoned
 * attempts against the allowance, and folds in admin-granted `extraAttempts`.
 * That page is the authority before starting a sitting and re-checks
 * server-side; this is a summary on a history screen, and the start route
 * rejects a student with nothing left regardless of what this said.
 */
function summarise(rows: readonly AttemptRow[]): StudentQuizHistory['summary'] {
  if (rows.length === 0) {
    return {
      quizzesTaken: 0,
      attemptsTotal: 0,
      averagePercent: null,
      bestPercent: null,
      passedCount: 0,
    };
  }

  const percents = rows.map(percentOf);
  const bestByLesson = new Map<string, { percent: number; passed: boolean | null }>();

  for (const row of rows) {
    const percent = percentOf(row);
    const current = bestByLesson.get(row.lessonId);
    if (!current || percent > current.percent) {
      bestByLesson.set(row.lessonId, { percent, passed: row.passed });
    }
  }

  return {
    quizzesTaken: bestByLesson.size,
    attemptsTotal: rows.length,
    averagePercent: Math.round(percents.reduce((sum, n) => sum + n, 0) / percents.length),
    bestPercent: maxOf(percents),
    passedCount: [...bestByLesson.values()].filter((entry) => entry.passed === true).length,
  };
}

/** `Math.max(...spread)` blows the stack on a large array; this does not. */
function maxOf(values: readonly number[]): number {
  return values.reduce((max, n) => (n > max ? n : max), values[0] ?? 0);
}
