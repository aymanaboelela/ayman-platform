import { Injectable } from '@nestjs/common';
import type {
  AdminAttemptCourseOption,
  AdminAttemptQuizSummary,
  AdminAttemptsOverview,
  AdminAttemptsOverviewQuery,
} from '@ayman/contracts/admin/attempts';
import { toAsciiDigits } from '@ayman/contracts/phone';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { foldArabic } from '../../common/arabic-fold';
import { attemptQuizKind, lectureNumbers } from './attempt-quiz-outline';

/** Flat and snake_cased exactly as Postgres returns it; `overview` is the only
 *  translator. */
interface CourseTotalRow {
  course_id: string;
  title: string;
  attempts: number;
}

interface QuizStatsRow {
  quiz_id: string;
  attempts: number;
  students: number;
  in_progress: number;
  overdue: number;
  submitted: number;
  pending_review: number;
  abandoned: number;
  /** Already 0–100: multiplied in `numeric` before the cast, so 18/20 is a
   *  clean 90 and not 89.99999999999999. */
  mean_percent: number | null;
  passed: number;
  decided: number;
  last_activity_at: Date | null;
}

/** Which courses (and, for the quiz view, which one quiz) a read covers. */
interface Scope {
  courseIds: string[];
  quizId: string | null;
  /** Every course with a sitting — the stats need no filter at all then. */
  everything: boolean;
}

/** One spelling for both sides of the title search: hamza and alef forms
 *  folded, Arabic-Indic digits made ASCII, runs of spaces collapsed. */
function searchable(text: string): string {
  return foldArabic(toAsciiDigits(text)).replace(/\s+/g, ' ').trim();
}

/**
 * «محاولات الطلاب», organised: every quiz under its course and its unit, in the
 * course's own order, with the numbers that say how it went.
 *
 * ## Three reads, whatever the size of the table
 *
 * 1. `courseTotals` — every course that has a sitting, for the picker: one
 *    pass over `quiz_attempts.quiz_id` hash-joined to three small tables.
 * 2. `outline` — the scope's courses with every unit, lesson and quiz, in one
 *    Prisma read (one statement per level, batched — never one per course).
 *    The whole outline is needed, not only the quiz lessons, because a quiz's
 *    «المحاضرة ٣» is counted over the lectures around it.
 * 3. `stats` — ONE grouped statement over `quiz_attempts` for every count and
 *    average on the screen. `count(DISTINCT user_id)` is why this is SQL and
 *    not a Prisma `groupBy`, which cannot express it.
 *
 * No new index. Measured 2026-10-17 on 61–66k synthetic sittings: the course
 * totals take ~27 ms; the unscoped stats ~70 ms, walking the existing unique
 * index on `(quiz_id, user_id, attempt_no)`, which already hands
 * `count(DISTINCT user_id)` its rows in order so there is no sort step; and a
 * one-course or one-quiz read stays under 2 ms on
 * `quiz_attempts_quiz_id_state_idx`.
 *
 * ## What is left out, on purpose
 *
 * A course nobody has sat anything in is not listed (it has nothing to show),
 * and inside a listed course a DRAFT quiz nobody has sat is skipped — every
 * other quiz is listed, with zeros where nobody has sat it yet, because «لسه
 * محدش امتحن الدرس التالت» is exactly the kind of thing this screen is for.
 */
@Injectable()
export class AttemptsOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(query: AdminAttemptsOverviewQuery): Promise<AdminAttemptsOverview> {
    const totals = await this.courseTotals();
    const courses: AdminAttemptCourseOption[] = totals.map((row) => ({
      courseId: row.course_id,
      courseTitle: row.title,
      attempts: row.attempts,
    }));

    const scope = await this.scope(query, totals);
    if (scope === null || scope.courseIds.length === 0) return { courses, quizzes: [] };

    const [outline, stats] = await Promise.all([this.outline(scope.courseIds), this.stats(scope)]);
    const statsByQuiz = new Map(stats.map((row) => [row.quiz_id, row]));

    // The courses come back in whatever order the IN list produced; the
    // screen's order is `courseTotals`' (archived last, then the admin
    // course list's own `position`).
    const rank = new Map(scope.courseIds.map((id, index) => [id, index]));
    outline.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

    const needle = query.q ? searchable(query.q) : null;
    const quizzes: AdminAttemptQuizSummary[] = [];

    for (const course of outline) {
      const numbers = lectureNumbers(course.sections, course.examLessonId);
      const courseMatches = needle !== null && searchable(course.title).includes(needle);

      for (const section of course.sections) {
        const sectionMatches = courseMatches || (needle !== null && searchable(section.title).includes(needle));

        for (const lesson of section.lessons) {
          const quiz = lesson.quiz;
          if (!quiz) continue;
          if (scope.quizId !== null && quiz.id !== scope.quizId) continue;

          const row = statsByQuiz.get(quiz.id);
          // A draft nobody has sat has nothing to show — unless it is the one
          // quiz the request named.
          if (scope.quizId === null && !quiz.isPublished && !row) continue;
          if (needle !== null && !sectionMatches && !searchable(lesson.title).includes(needle)) continue;

          const kind = attemptQuizKind(lesson, section.title, course.examLessonId);
          quizzes.push({
            quizId: quiz.id,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            kind,
            lectureNumber: kind === 'lecture_quiz' ? (numbers.get(lesson.id) ?? null) : null,
            published: quiz.isPublished && lesson.isPublished && section.isPublished,
            courseId: course.id,
            courseTitle: course.title,
            courseArchived: course.status === 'archived',
            sectionId: section.id,
            sectionTitle: section.title,
            gradeOutOf: Number(quiz.gradeOutOf),
            passPercent: Number(quiz.passPercent),
            allowsImprovement: quiz.allowsImprovement,
            attempts: row?.attempts ?? 0,
            students: row?.students ?? 0,
            inProgress: row?.in_progress ?? 0,
            overdue: row?.overdue ?? 0,
            submitted: row?.submitted ?? 0,
            pendingReview: row?.pending_review ?? 0,
            abandoned: row?.abandoned ?? 0,
            averagePercent: row?.mean_percent ?? null,
            passRatePercent: row && row.decided > 0 ? (row.passed * 100) / row.decided : null,
            lastActivityAt: row?.last_activity_at?.toISOString() ?? null,
          });
        }
      }
    }

    return { courses, quizzes };
  }

  /**
   * Every course with at least one sitting, in the order the screen lists
   * them: archived courses last (their sittings are history), then the admin
   * course list's own `position`, `id` breaking ties so two loads agree.
   */
  private courseTotals(): Promise<CourseTotalRow[]> {
    return this.prisma.$queryRaw<CourseTotalRow[]>`
      SELECT c."id" AS course_id, c."title", count(*)::int AS attempts
      FROM "app"."quiz_attempts" a
      JOIN "app"."quizzes" q ON q."id" = a."quiz_id"
      JOIN "app"."lessons" l ON l."id" = q."lesson_id"
      JOIN "app"."courses" c ON c."id" = l."course_id"
      GROUP BY c."id"
      ORDER BY (c."status" = 'archived'), c."position", c."id"
    `;
  }

  /**
   * One quiz, one course, or everything — and `null` for a quiz that does not
   * exist, which the screen turns into its 404.
   *
   * Filters AND together: a `courseId` beside a `quizId` from another course
   * is an empty answer, not the quiz.
   */
  private async scope(query: AdminAttemptsOverviewQuery, totals: CourseTotalRow[]): Promise<Scope | null> {
    if (query.quizId || query.lessonId) {
      const quiz = await this.prisma.quiz.findFirst({
        where: {
          ...(query.quizId ? { id: query.quizId } : {}),
          ...(query.lessonId ? { lessonId: query.lessonId } : {}),
          ...(query.courseId ? { lesson: { courseId: query.courseId } } : {}),
        },
        select: { id: true, lesson: { select: { courseId: true } } },
      });
      return quiz ? { courseIds: [quiz.lesson.courseId], quizId: quiz.id, everything: false } : null;
    }
    if (query.courseId) return { courseIds: [query.courseId], quizId: null, everything: false };
    return { courseIds: totals.map((row) => row.course_id), quizId: null, everything: true };
  }

  private outline(courseIds: string[]) {
    return this.prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: {
        id: true,
        title: true,
        status: true,
        examLessonId: true,
        sections: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            title: true,
            isPublished: true,
            lessons: {
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                title: true,
                kind: true,
                isPublished: true,
                quiz: {
                  select: {
                    id: true,
                    isPublished: true,
                    gradeOutOf: true,
                    passPercent: true,
                    allowsImprovement: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Every number on a quiz card, from one statement.
   *
   * The average and the pass rate read `submitted` ONLY. A `pending_review`
   * paper counts its unmarked essays as zero and wrote `passed` from that
   * provisional total (`grading/mark-split.ts`), so letting it in would sink
   * an essay exam's mean, and fail half its class, until the marking is done.
   * Each sitting divides by its OWN `grade_out_of` snapshot, so a quiz whose
   * scale was edited between sittings still averages like with like.
   *
   * Last activity is the latest of the activity stamp and the hand-in — a
   * sitting nobody touched after submitting has nothing later than that.
   */
  private stats(scope: Scope): Promise<QuizStatsRow[]> {
    const where = scope.quizId
      ? Prisma.sql`WHERE a."quiz_id" = ${scope.quizId}::uuid`
      : scope.everything
        ? Prisma.empty
        : Prisma.sql`WHERE a."quiz_id" IN (
            SELECT q."id" FROM "app"."quizzes" q
            JOIN "app"."lessons" l ON l."id" = q."lesson_id"
            WHERE l."course_id" = ANY(${scope.courseIds}::uuid[])
          )`;

    return this.prisma.$queryRaw<QuizStatsRow[]>(Prisma.sql`
      SELECT
        a."quiz_id" AS quiz_id,
        count(*)::int AS attempts,
        count(DISTINCT a."user_id")::int AS students,
        count(*) FILTER (WHERE a."state" = 'in_progress')::int AS in_progress,
        count(*) FILTER (WHERE a."state" = 'overdue')::int AS overdue,
        count(*) FILTER (WHERE a."state" = 'submitted')::int AS submitted,
        count(*) FILTER (WHERE a."state" = 'pending_review')::int AS pending_review,
        count(*) FILTER (WHERE a."state" = 'abandoned')::int AS abandoned,
        (avg(a."scaled_score" * 100 / NULLIF(a."grade_out_of", 0))
          FILTER (WHERE a."state" = 'submitted'))::float AS mean_percent,
        count(*) FILTER (WHERE a."state" = 'submitted' AND a."passed" IS TRUE)::int AS passed,
        count(*) FILTER (WHERE a."state" = 'submitted' AND a."passed" IS NOT NULL)::int AS decided,
        max(GREATEST(a."last_activity_at", COALESCE(a."submitted_at", a."started_at"))) AS last_activity_at
      FROM "app"."quiz_attempts" a
      ${where}
      GROUP BY a."quiz_id"
    `);
  }
}
