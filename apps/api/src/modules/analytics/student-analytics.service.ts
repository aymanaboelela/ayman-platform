import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  DailyPoint,
  StudentAnalyticsDetail,
  StudentAnalyticsRow,
  StudentAttemptRow,
  StudentCourseRow,
} from '@ayman/contracts/admin/analytics';
import { STUDENT_ANALYTICS_SORTS } from '@ayman/contracts/admin/analytics';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { bucketsFrom, cairoDay, clampFraction, dayKeys, gradeBandsFrom, rate } from './analytics-shared';

export interface StudentAnalyticsQuery {
  page: number;
  perPage: number;
  q: string;
  sort: (typeof STUDENT_ANALYTICS_SORTS)[number];
  dir: 'asc' | 'desc';
  year: number[];
  courseId: string | null;
}

interface StudentAggregateRow {
  user_id: string;
  full_name: string;
  year: number | null;
  governorate: string | null;
  enrollments: number;
  opened: number;
  completed: number;
  avg_completion: number | null;
  watch_seconds: number;
  quizzes: number;
  attempts: number;
  mean: number | null;
  best: number | null;
  passed: number;
  decided: number;
  median_seconds: number | null;
  last_active: Date | null;
}

/**
 * ## Sorting is a hardcoded map, never a raw key
 *
 * Same rule `StudentsService.list` follows (A3): `query.sort` is looked up in
 * `SORT_COLUMNS` and the LOOKED-UP fragment reaches SQL. These are computed
 * columns in a CTE, so they cannot go through Prisma's `orderBy` at all — an
 * interpolated column name would be a raw string in an `ORDER BY`, which is
 * the one place a bound parameter cannot save you.
 *
 * ## Why the roster is one query and not N+1
 *
 * Every column below is an aggregate over a different table, and the obvious
 * shape — list the students, then fetch each one's numbers — is fifty round
 * trips per page. Lateral joins keep it at one, and keep the sort honest:
 * sorting by mean score has to happen in the database or page 1 is "the
 * highest scorers on page 1", which is not the same list.
 */
const SORT_COLUMNS: Record<(typeof STUDENT_ANALYTICS_SORTS)[number], Prisma.Sql> = {
  fullName: Prisma.sql`full_name`,
  lessonsCompleted: Prisma.sql`completed`,
  watchHours: Prisma.sql`watch_seconds`,
  avgCompletion: Prisma.sql`avg_completion`,
  attempts: Prisma.sql`attempts`,
  meanScore: Prisma.sql`mean`,
  passRate: Prisma.sql`CASE WHEN decided > 0 THEN passed::float / decided ELSE NULL END`,
  lastActiveAt: Prisma.sql`last_active`,
};

@Injectable()
export class StudentAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: StudentAnalyticsQuery,
  ): Promise<{ rows: StudentAnalyticsRow[]; rowCount: number }> {
    const filters: Prisma.Sql[] = [];
    if (query.q) filters.push(Prisma.sql`pr."full_name" ILIKE ${`%${query.q}%`}`);
    if (query.year.length > 0) filters.push(Prisma.sql`pr."year" = ANY(${query.year}::int[])`);
    if (query.courseId) {
      filters.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "app"."enrollments" e2
        WHERE e2."user_id" = pr."user_id" AND e2."status" = 'active'
          AND e2."course_id" = ${query.courseId}::uuid
      )`);
    }
    const where =
      filters.length > 0 ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}` : Prisma.empty;

    // NULLS LAST in both directions: a student who has never sat a quiz has no
    // mean score, and floating them to the top of "best scores" would make the
    // sort read as if they were the best.
    const direction =
      query.dir === 'asc' ? Prisma.sql`ASC NULLS LAST` : Prisma.sql`DESC NULLS LAST`;
    const orderBy = SORT_COLUMNS[query.sort] ?? SORT_COLUMNS.fullName;

    const [rows, [count]] = await Promise.all([
      this.prisma.$queryRaw<StudentAggregateRow[]>(Prisma.sql`
        ${this.rosterCte(where)}
        SELECT * FROM roster
        ORDER BY ${orderBy} ${direction}, full_name ASC
        LIMIT ${query.perPage} OFFSET ${(query.page - 1) * query.perPage}
      `),
      this.prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
        SELECT count(*)::int AS n
        FROM "app"."student_profiles" pr
        JOIN "app"."users" u ON u."id" = pr."user_id" AND u."role" = 'student'
        ${where}
      `),
    ]);

    return { rows: rows.map(toRow), rowCount: count?.n ?? 0 };
  }

  async detail(userId: string): Promise<StudentAnalyticsDetail> {
    const [row] = await this.prisma.$queryRaw<StudentAggregateRow[]>(Prisma.sql`
      ${this.rosterCte(Prisma.sql`WHERE pr."user_id" = ${userId}`)}
      SELECT * FROM roster
    `);
    if (!row) throw new NotFoundException();

    const [cohort, courses, attempts, daily] = await Promise.all([
      this.cohort(),
      this.courses(userId),
      this.attempts(userId),
      this.daily(userId),
    ]);

    const fractions = attempts
      .map((attempt) => attempt.score)
      .filter((value): value is number => value !== null);

    return {
      summary: toRow(row),
      cohort,
      courses,
      attempts,
      scoreBuckets: bucketsFrom(fractions),
      gradeBands: gradeBandsFrom(fractions),
      daily,
    };
  }

  /**
   * The roster CTE, shared by the list and the detail so a student's row on
   * the table and the same student's headline on their own page can never
   * disagree — the single most confusing bug this screen could have.
   */
  private rosterCte(where: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`
      WITH roster AS (
        SELECT
          pr."user_id", pr."full_name", pr."year"::int AS year, g."name_ar" AS governorate,
          COALESCE(en.n, 0) AS enrollments,
          COALESCE(p.opened, 0) AS opened,
          COALESCE(p.completed, 0) AS completed,
          p.avg_completion,
          COALESCE(p.watch_seconds, 0) AS watch_seconds,
          COALESCE(a.quizzes, 0) AS quizzes,
          COALESCE(a.attempts, 0) AS attempts,
          a.mean, a.best,
          COALESCE(a.passed, 0) AS passed,
          COALESCE(a.decided, 0) AS decided,
          a.median_seconds,
          GREATEST(p.last_seen, a.last_activity) AS last_active
        FROM "app"."student_profiles" pr
        JOIN "app"."users" u ON u."id" = pr."user_id" AND u."role" = 'student'
        LEFT JOIN "app"."governorates" g ON g."code" = pr."governorate_code"
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS n FROM "app"."enrollments" e
          WHERE e."user_id" = pr."user_id" AND e."status" = 'active'
        ) en ON TRUE
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS opened,
                 count(*) FILTER (WHERE lp."state" IN ('completed', 'passed'))::int AS completed,
                 avg(lp."completion")::float AS avg_completion,
                 sum(lp."watched_seconds")::int AS watch_seconds,
                 max(lp."last_heartbeat_at") AS last_seen
          FROM "app"."lesson_progress" lp
          JOIN "app"."enrollments" e ON e."id" = lp."enrollment_id"
          WHERE e."user_id" = pr."user_id" AND lp."open_count" > 0
        ) p ON TRUE
        LEFT JOIN LATERAL (
          SELECT count(DISTINCT at."quiz_id")::int AS quizzes,
                 count(*)::int AS attempts,
                 avg(at."scaled_score" / NULLIF(at."grade_out_of", 0))::float AS mean,
                 max(at."scaled_score" / NULLIF(at."grade_out_of", 0))::float AS best,
                 count(*) FILTER (WHERE at."passed" IS TRUE)::int AS passed,
                 count(*) FILTER (WHERE at."passed" IS NOT NULL)::int AS decided,
                 percentile_cont(0.5) WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM (at."submitted_at" - at."started_at"))
                 ) FILTER (WHERE at."submitted_at" >= at."started_at")::float AS median_seconds,
                 max(at."last_activity_at") AS last_activity
          FROM "app"."quiz_attempts" at
          WHERE at."user_id" = pr."user_id" AND at."state" IN ('submitted', 'pending_review')
        ) a ON TRUE
        ${where}
      )
    `;
  }

  /** The class average on the same four measures. Every number on a student's
   *  page is rendered against this — a lone «٦٨٪» answers nothing. */
  private async cohort(): Promise<StudentAnalyticsDetail['cohort']> {
    const [row] = await this.prisma.$queryRaw<
      {
        avg_completion: number | null;
        mean: number | null;
        passed: number;
        decided: number;
        median_seconds: number | null;
      }[]
    >(Prisma.sql`
      SELECT
        (SELECT avg(lp."completion")::float FROM "app"."lesson_progress" lp WHERE lp."open_count" > 0) AS avg_completion,
        (SELECT avg(a."scaled_score" / NULLIF(a."grade_out_of", 0))::float
           FROM "app"."quiz_attempts" a WHERE a."state" IN ('submitted', 'pending_review')) AS mean,
        (SELECT count(*)::int FROM "app"."quiz_attempts" a
          WHERE a."state" IN ('submitted', 'pending_review') AND a."passed" IS TRUE) AS passed,
        (SELECT count(*)::int FROM "app"."quiz_attempts" a
          WHERE a."state" IN ('submitted', 'pending_review') AND a."passed" IS NOT NULL) AS decided,
        (SELECT percentile_cont(0.5) WITHIN GROUP (
                  ORDER BY EXTRACT(EPOCH FROM (a."submitted_at" - a."started_at"))
                )::float
           FROM "app"."quiz_attempts" a
          WHERE a."state" IN ('submitted', 'pending_review') AND a."submitted_at" >= a."started_at") AS median_seconds
    `);

    return {
      avgCompletion: clampFraction(row?.avg_completion ?? null),
      meanScore: clampFraction(row?.mean ?? null),
      passRate: rate(row?.passed ?? 0, row?.decided ?? 0),
      medianQuizSeconds: row?.median_seconds ?? null,
    };
  }

  private async courses(userId: string): Promise<StudentCourseRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        course_id: string;
        title: string;
        lessons: number;
        opened: number;
        completed: number;
        avg_completion: number | null;
        watch_seconds: number;
      }[]
    >(Prisma.sql`
      SELECT c."id" AS course_id, c."title",
             (SELECT count(*)::int FROM "app"."lessons" l WHERE l."course_id" = c."id") AS lessons,
             COALESCE(p.opened, 0) AS opened,
             COALESCE(p.completed, 0) AS completed,
             p.avg_completion,
             COALESCE(p.watch_seconds, 0) AS watch_seconds
      FROM "app"."enrollments" e
      JOIN "app"."courses" c ON c."id" = e."course_id"
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS opened,
               count(*) FILTER (WHERE lp."state" IN ('completed', 'passed'))::int AS completed,
               avg(lp."completion")::float AS avg_completion,
               sum(lp."watched_seconds")::int AS watch_seconds
        FROM "app"."lesson_progress" lp
        WHERE lp."enrollment_id" = e."id" AND lp."open_count" > 0
      ) p ON TRUE
      WHERE e."user_id" = ${userId} AND e."status" = 'active'
      ORDER BY c."title"
    `);

    return rows.map((row) => ({
      courseId: row.course_id,
      title: row.title,
      lessons: row.lessons,
      opened: row.opened,
      completed: row.completed,
      avgCompletion: clampFraction(row.avg_completion),
      watchHours: row.watch_seconds / 3600,
    }));
  }

  /**
   * Every sitting, INCLUDING the ones still in progress and the abandoned
   * ones. The aggregates above count only graded attempts — a mean that
   * included a half-finished paper would be wrong — but the timeline is the
   * one place a teacher needs to see the attempt that was never handed in.
   */
  private async attempts(userId: string): Promise<StudentAttemptRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        attempt_id: string;
        quiz_id: string;
        lesson_title: string;
        attempt_no: number;
        state: string;
        frac: number | null;
        passed: boolean | null;
        secs: number | null;
        submitted_at: Date | null;
      }[]
    >(Prisma.sql`
      SELECT a."id" AS attempt_id, a."quiz_id", l."title" AS lesson_title,
             a."attempt_no", a."state"::text AS state,
             (a."scaled_score" / NULLIF(a."grade_out_of", 0))::float AS frac,
             a."passed",
             CASE WHEN a."submitted_at" >= a."started_at"
                  THEN EXTRACT(EPOCH FROM (a."submitted_at" - a."started_at"))::int END AS secs,
             a."submitted_at"
      FROM "app"."quiz_attempts" a
      JOIN "app"."quizzes" q ON q."id" = a."quiz_id"
      JOIN "app"."lessons" l ON l."id" = q."lesson_id"
      WHERE a."user_id" = ${userId}
      ORDER BY a."started_at" DESC
      LIMIT 200
    `);

    return rows.map((row) => ({
      attemptId: row.attempt_id,
      quizId: row.quiz_id,
      quizTitle: row.lesson_title,
      lessonTitle: row.lesson_title,
      attemptNo: row.attempt_no,
      state: row.state,
      score: clampFraction(row.frac),
      passed: row.passed,
      seconds: row.secs,
      submittedAt: row.submitted_at?.toISOString() ?? null,
    }));
  }

  /** Ninety days of this student's own activity — the shape that answers
   *  «بيذاكر إمتى، وبقاله قد إيه مش داخل». */
  private async daily(userId: string): Promise<DailyPoint[]> {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [watchRows, attemptRows] = await Promise.all([
      this.prisma.$queryRaw<{ day: string; seconds: number }[]>(Prisma.sql`
        SELECT ${cairoDay('vs."started_at"')} AS day,
               sum(vs."watched_seconds")::int AS seconds
        FROM "app"."lesson_view_sessions" vs
        JOIN "app"."enrollments" e ON e."id" = vs."enrollment_id"
        WHERE e."user_id" = ${userId} AND vs."started_at" >= ${since}
        GROUP BY 1
      `),
      this.prisma.$queryRaw<{ day: string; attempts: number }[]>(Prisma.sql`
        SELECT ${cairoDay('a."started_at"')} AS day,
               count(*)::int AS attempts
        FROM "app"."quiz_attempts" a
        WHERE a."user_id" = ${userId} AND a."started_at" >= ${since}
        GROUP BY 1
      `),
    ]);

    const watchByDay = new Map(watchRows.map((row) => [row.day, row.seconds]));
    const attemptByDay = new Map(attemptRows.map((row) => [row.day, row.attempts]));

    return dayKeys(since, new Date()).map((date) => {
      const seconds = watchByDay.get(date) ?? 0;
      const attempts = attemptByDay.get(date) ?? 0;
      return {
        date,
        watchMinutes: seconds / 60,
        attempts,
        // One student: they were either active that day or they were not.
        activeStudents: seconds > 0 || attempts > 0 ? 1 : 0,
      };
    });
  }
}

function toRow(row: StudentAggregateRow): StudentAnalyticsRow {
  return {
    userId: row.user_id,
    fullName: row.full_name,
    year: row.year,
    governorateNameAr: row.governorate,
    enrollments: row.enrollments,
    lessonsOpened: row.opened,
    lessonsCompleted: row.completed,
    avgCompletion: clampFraction(row.avg_completion),
    watchHours: row.watch_seconds / 3600,
    quizzesTaken: row.quizzes,
    attempts: row.attempts,
    meanScore: clampFraction(row.mean),
    bestScore: clampFraction(row.best),
    passRate: rate(row.passed, row.decided),
    medianQuizSeconds: row.median_seconds,
    lastActiveAt: row.last_active?.toISOString() ?? null,
  };
}
