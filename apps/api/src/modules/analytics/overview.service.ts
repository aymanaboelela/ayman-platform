import { Injectable } from '@nestjs/common';
import type {
  AnalyticsOverview,
  Bucket,
  DailyPoint,
  EngagementSlice,
  GovernorateBreakdown,
  YearBreakdown,
} from '@ayman/contracts/admin/analytics';
import { GRADE_BANDS } from '@ayman/contracts/admin/analytics';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { cairoDay, clampFraction, dayKeys, durationBucketsFrom, rate } from './analytics-shared';

export interface OverviewQuery {
  /** Trailing window for the daily series. The headline counts are all-time —
   *  a "total students" that silently meant "last 30 days" would be the most
   *  quotable wrong number on the screen. */
  days: number;
  /** Narrows EVERY number on the screen, not just the lesson ones. */
  courseId: string | null;
}

/**
 * ## Why this file is SQL and not Prisma
 *
 * Every number here is an aggregate over a table that grows with
 * students × lessons. Pulling rows to count them in JS works on a seed
 * database and falls over on a real one, and the shape that hides it longest
 * is exactly the one an admin screen invites: uncached, read on every visit.
 * `percentile_cont`, `width_bucket` and `FILTER (WHERE …)` do this work in one
 * pass; there is no Prisma expression for any of the three.
 *
 * ## The denominator rule, enforced here
 *
 * `eligible` is computed ONCE — distinct students holding an active enrollment
 * (in `courseId`, when filtered) — and every rate on the overview divides by
 * it. It is deliberately not "students who opened something": a participation
 * rate whose denominator is participation reads ~100% forever and is the
 * easiest way for this screen to lie. See the contract file.
 *
 * The corollary, and the one that actually bit: every NUMERATOR must be drawn
 * from that same set. Each query below therefore joins `enrollments … status =
 * 'active'`, including the ones counting attempts — a student who sat a quiz
 * and later had their enrollment cancelled is otherwise in the numerator and
 * not the denominator, and the rate goes over 100%. See
 * `lesson-analytics.service.ts` for the case that surfaced it.
 *
 * ## `quizzes.lesson_id` is NOT NULL
 *
 * Every quiz belongs to exactly one lesson (`Quiz.lessonId` is required and
 * `@unique`), so the lessons join below is always an INNER join and the course
 * filter reaches quizzes through it. Nothing here needs to consider a
 * free-floating quiz, because the schema cannot hold one.
 */
@Injectable()
export class OverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async build(query: OverviewQuery): Promise<AnalyticsOverview> {
    const now = Date.now();
    const since = new Date(now - query.days * 24 * 60 * 60 * 1000);
    const since7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const since30 = new Date(now - 30 * 24 * 60 * 60 * 1000);

    // One course predicate per table it has to reach. `Prisma.empty` rather
    // than a `TRUE` literal so the unfiltered query is the plain one.
    const byEnrollment = query.courseId
      ? Prisma.sql`AND e."course_id" = ${query.courseId}::uuid`
      : Prisma.empty;
    const byLesson = query.courseId
      ? Prisma.sql`AND l."course_id" = ${query.courseId}::uuid`
      : Prisma.empty;

    const [students, video, quiz, distributions, engagement, daily, byYear, byGovernorate] =
      await Promise.all([
        this.students(since7, since30, byEnrollment),
        this.video(byEnrollment, byLesson),
        this.quiz(byLesson),
        this.distributions(byLesson),
        this.engagement(byEnrollment, byLesson),
        this.daily(since, byEnrollment, byLesson),
        this.byYear(byEnrollment, byLesson),
        this.byGovernorate(byEnrollment, byLesson),
      ]);

    return {
      students,
      video: { ...video, watchRate: rate(video.watchers, video.eligible) },
      quiz: { ...quiz, participationRate: rate(quiz.participants, video.eligible) },
      ...distributions,
      engagement,
      daily,
      byYear,
      byGovernorate,
    };
  }

  /**
   * "Active" means DID something — a view session or an attempt. Signing in is
   * not activity: the shell polls on load, so a session-based count rises
   * every time someone opens the tab and reads nothing.
   */
  private async students(
    since7: Date,
    since30: Date,
    byEnrollment: Prisma.Sql,
  ): Promise<AnalyticsOverview['students']> {
    const [row] = await this.prisma.$queryRaw<
      { total: number; onboarded: number; new_30: number; active_7: number; active_30: number }[]
    >(Prisma.sql`
      WITH scoped AS (
        SELECT DISTINCT p."user_id", p."onboarding_completed_at", p."created_at"
        FROM "app"."student_profiles" p
        JOIN "app"."users" u ON u."id" = p."user_id" AND u."role" = 'student'
        JOIN "app"."enrollments" e ON e."user_id" = p."user_id" AND e."status" = 'active' ${byEnrollment}
      ),
      acted AS (
        SELECT e."user_id", vs."last_seen_at" AS at
        FROM "app"."lesson_view_sessions" vs
        JOIN "app"."enrollments" e ON e."id" = vs."enrollment_id" AND TRUE ${byEnrollment}
        UNION ALL
        SELECT a."user_id", a."last_activity_at" AS at
        FROM "app"."quiz_attempts" a
      )
      SELECT
        (SELECT count(*)::int FROM scoped) AS total,
        (SELECT count(*)::int FROM scoped WHERE "onboarding_completed_at" IS NOT NULL) AS onboarded,
        (SELECT count(*)::int FROM scoped WHERE "created_at" >= ${since30}) AS new_30,
        (SELECT count(DISTINCT acted."user_id")::int FROM acted
          WHERE acted.at >= ${since7} AND acted."user_id" IN (SELECT "user_id" FROM scoped)) AS active_7,
        (SELECT count(DISTINCT acted."user_id")::int FROM acted
          WHERE acted.at >= ${since30} AND acted."user_id" IN (SELECT "user_id" FROM scoped)) AS active_30
    `);

    return {
      total: row?.total ?? 0,
      onboarded: row?.onboarded ?? 0,
      newLast30: row?.new_30 ?? 0,
      activeLast7: row?.active_7 ?? 0,
      activeLast30: row?.active_30 ?? 0,
    };
  }

  private async video(
    byEnrollment: Prisma.Sql,
    byLesson: Prisma.Sql,
  ): Promise<Omit<AnalyticsOverview['video'], 'watchRate'>> {
    const [row] = await this.prisma.$queryRaw<
      {
        eligible: number;
        watchers: number;
        watch_seconds: number;
        opened: number;
        completed: number;
        avg_completion: number | null;
      }[]
    >(Prisma.sql`
      WITH touched AS (
        SELECT e."user_id", lp."watched_seconds", lp."completion", lp."state"
        FROM "app"."lesson_progress" lp
        JOIN "app"."enrollments" e
          ON e."id" = lp."enrollment_id" AND e."status" = 'active' ${byEnrollment}
        JOIN "app"."lessons" l ON l."id" = lp."lesson_id" AND TRUE ${byLesson}
        WHERE lp."open_count" > 0
      )
      SELECT
        (SELECT count(DISTINCT e."user_id")::int
           FROM "app"."enrollments" e WHERE e."status" = 'active' ${byEnrollment}) AS eligible,
        (SELECT count(DISTINCT "user_id")::int FROM touched WHERE "watched_seconds" > 0) AS watchers,
        COALESCE((SELECT sum("watched_seconds") FROM touched), 0)::int AS watch_seconds,
        (SELECT count(*)::int FROM touched) AS opened,
        (SELECT count(*)::int FROM touched WHERE "state" IN ('completed', 'passed')) AS completed,
        (SELECT avg("completion")::float FROM touched) AS avg_completion
    `);

    return {
      eligible: row?.eligible ?? 0,
      watchers: row?.watchers ?? 0,
      watchHours: (row?.watch_seconds ?? 0) / 3600,
      lessonsOpened: row?.opened ?? 0,
      lessonsCompleted: row?.completed ?? 0,
      avgCompletion: clampFraction(row?.avg_completion ?? null),
    };
  }

  private async quiz(
    byLesson: Prisma.Sql,
  ): Promise<Omit<AnalyticsOverview['quiz'], 'participationRate'>> {
    const [row] = await this.prisma.$queryRaw<
      {
        quizzes: number;
        attempts: number;
        participants: number;
        mean_score: number | null;
        median_score: number | null;
        passed: number;
        decided: number;
        mean_seconds: number | null;
        median_seconds: number | null;
      }[]
    >(Prisma.sql`
      WITH graded AS (
        SELECT a."user_id", a."quiz_id", a."passed",
               a."scaled_score" / NULLIF(a."grade_out_of", 0) AS frac,
               CASE WHEN a."submitted_at" >= a."started_at"
                    THEN EXTRACT(EPOCH FROM (a."submitted_at" - a."started_at")) END AS secs
        FROM "app"."quiz_attempts" a
        JOIN "app"."quizzes" q ON q."id" = a."quiz_id"
        JOIN "app"."lessons" l ON l."id" = q."lesson_id" AND TRUE ${byLesson}
        JOIN "app"."enrollments" e
          ON e."user_id" = a."user_id" AND e."course_id" = l."course_id" AND e."status" = 'active'
        WHERE a."state" IN ('submitted', 'pending_review')
      )
      SELECT
        (SELECT count(DISTINCT "quiz_id")::int FROM graded) AS quizzes,
        (SELECT count(*)::int FROM graded) AS attempts,
        (SELECT count(DISTINCT "user_id")::int FROM graded) AS participants,
        (SELECT avg(frac)::float FROM graded) AS mean_score,
        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY frac)::float FROM graded WHERE frac IS NOT NULL) AS median_score,
        (SELECT count(*)::int FROM graded WHERE "passed" IS TRUE) AS passed,
        (SELECT count(*)::int FROM graded WHERE "passed" IS NOT NULL) AS decided,
        (SELECT avg(secs)::float FROM graded) AS mean_seconds,
        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY secs)::float FROM graded WHERE secs IS NOT NULL) AS median_seconds
    `);

    return {
      quizzes: row?.quizzes ?? 0,
      attempts: row?.attempts ?? 0,
      participants: row?.participants ?? 0,
      meanScore: clampFraction(row?.mean_score ?? null),
      medianScore: clampFraction(row?.median_score ?? null),
      passRate: rate(row?.passed ?? 0, row?.decided ?? 0),
      meanDurationSeconds: row?.mean_seconds ?? null,
      medianDurationSeconds: row?.median_seconds ?? null,
    };
  }

  private async distributions(byLesson: Prisma.Sql): Promise<{
    scoreBuckets: Bucket[];
    gradeBands: AnalyticsOverview['gradeBands'];
    durationBuckets: AnalyticsOverview['durationBuckets'];
    completionBuckets: Bucket[];
  }> {
    const [scoreRows, bandRows, durationRows, completionRows] = await Promise.all([
      this.prisma.$queryRaw<{ bucket: number; n: number }[]>(Prisma.sql`
        SELECT LEAST(width_bucket(a."scaled_score" / NULLIF(a."grade_out_of", 0), 0, 1, 10), 10)::int AS bucket,
               count(*)::int AS n
        FROM "app"."quiz_attempts" a
        JOIN "app"."quizzes" q ON q."id" = a."quiz_id"
        JOIN "app"."lessons" l ON l."id" = q."lesson_id" AND TRUE ${byLesson}
        JOIN "app"."enrollments" e
          ON e."user_id" = a."user_id" AND e."course_id" = l."course_id" AND e."status" = 'active'
        WHERE a."state" IN ('submitted', 'pending_review') AND a."scaled_score" IS NOT NULL
        GROUP BY 1 ORDER BY 1
      `),
      this.prisma.$queryRaw<{ band: string; n: number }[]>(Prisma.sql`
        SELECT CASE
                 WHEN frac >= 0.85 THEN 'a'
                 WHEN frac >= 0.75 THEN 'b'
                 WHEN frac >= 0.65 THEN 'c'
                 WHEN frac >= 0.50 THEN 'd'
                 ELSE 'f'
               END AS band,
               count(*)::int AS n
        FROM (
          SELECT a."scaled_score" / NULLIF(a."grade_out_of", 0) AS frac
          FROM "app"."quiz_attempts" a
          JOIN "app"."quizzes" q ON q."id" = a."quiz_id"
          JOIN "app"."lessons" l ON l."id" = q."lesson_id" AND TRUE ${byLesson}
          WHERE a."state" IN ('submitted', 'pending_review') AND a."scaled_score" IS NOT NULL
        ) s
        WHERE frac IS NOT NULL
        GROUP BY 1
      `),
      this.prisma.$queryRaw<{ secs: number }[]>(Prisma.sql`
        SELECT EXTRACT(EPOCH FROM (a."submitted_at" - a."started_at"))::int AS secs
        FROM "app"."quiz_attempts" a
        JOIN "app"."quizzes" q ON q."id" = a."quiz_id"
        JOIN "app"."lessons" l ON l."id" = q."lesson_id" AND TRUE ${byLesson}
        JOIN "app"."enrollments" e
          ON e."user_id" = a."user_id" AND e."course_id" = l."course_id" AND e."status" = 'active'
        WHERE a."state" IN ('submitted', 'pending_review') AND a."submitted_at" >= a."started_at"
      `),
      this.prisma.$queryRaw<{ bucket: number; n: number }[]>(Prisma.sql`
        SELECT LEAST(width_bucket(lp."completion", 0, 1, 10), 10)::int AS bucket, count(*)::int AS n
        FROM "app"."lesson_progress" lp
        JOIN "app"."enrollments" e ON e."id" = lp."enrollment_id" AND e."status" = 'active'
        JOIN "app"."lessons" l ON l."id" = lp."lesson_id" AND TRUE ${byLesson}
        WHERE lp."open_count" > 0
        GROUP BY 1 ORDER BY 1
      `),
    ]);

    const bandByKey = new Map(bandRows.map((row) => [row.band, row.n]));

    return {
      scoreBuckets: scoreRows,
      gradeBands: GRADE_BANDS.map((band) => ({ band, n: bandByKey.get(band) ?? 0 })),
      durationBuckets: durationBucketsFrom(durationRows.map((row) => row.secs)),
      completionBuckets: completionRows,
    };
  }

  /**
   * The four-way split, over the eligible set rather than over the union of
   * who did something — so the segments sum to `eligible` exactly. Anything
   * less and the slices do not add to the whole, which is the one thing a
   * part-to-whole chart promises.
   */
  private async engagement(
    byEnrollment: Prisma.Sql,
    byLesson: Prisma.Sql,
  ): Promise<EngagementSlice[]> {
    const [row] = await this.prisma.$queryRaw<
      { both: number; video_only: number; quiz_only: number; neither: number }[]
    >(Prisma.sql`
      WITH eligible AS (
        SELECT DISTINCT e."user_id" FROM "app"."enrollments" e WHERE e."status" = 'active' ${byEnrollment}
      ),
      watched AS (
        SELECT DISTINCT e."user_id"
        FROM "app"."lesson_progress" lp
        JOIN "app"."enrollments" e
          ON e."id" = lp."enrollment_id" AND e."status" = 'active' ${byEnrollment}
        JOIN "app"."lessons" l ON l."id" = lp."lesson_id" AND TRUE ${byLesson}
        WHERE lp."watched_seconds" > 0
      ),
      sat AS (
        SELECT DISTINCT a."user_id"
        FROM "app"."quiz_attempts" a
        JOIN "app"."quizzes" q ON q."id" = a."quiz_id"
        JOIN "app"."lessons" l ON l."id" = q."lesson_id" AND TRUE ${byLesson}
        WHERE a."state" IN ('submitted', 'pending_review')
      )
      SELECT
        count(*) FILTER (WHERE w."user_id" IS NOT NULL AND s."user_id" IS NOT NULL)::int AS both,
        count(*) FILTER (WHERE w."user_id" IS NOT NULL AND s."user_id" IS NULL)::int AS video_only,
        count(*) FILTER (WHERE w."user_id" IS NULL AND s."user_id" IS NOT NULL)::int AS quiz_only,
        count(*) FILTER (WHERE w."user_id" IS NULL AND s."user_id" IS NULL)::int AS neither
      FROM eligible el
      LEFT JOIN watched w ON w."user_id" = el."user_id"
      LEFT JOIN sat s ON s."user_id" = el."user_id"
    `);

    return [
      { segment: 'both', n: row?.both ?? 0 },
      { segment: 'videoOnly', n: row?.video_only ?? 0 },
      { segment: 'quizOnly', n: row?.quiz_only ?? 0 },
      { segment: 'neither', n: row?.neither ?? 0 },
    ];
  }

  private async daily(
    since: Date,
    byEnrollment: Prisma.Sql,
    byLesson: Prisma.Sql,
  ): Promise<DailyPoint[]> {
    const [watchRows, attemptRows] = await Promise.all([
      this.prisma.$queryRaw<{ day: string; seconds: number; students: number }[]>(Prisma.sql`
        SELECT ${cairoDay('vs."started_at"')} AS day,
               sum(vs."watched_seconds")::int AS seconds,
               count(DISTINCT e."user_id")::int AS students
        FROM "app"."lesson_view_sessions" vs
        JOIN "app"."enrollments" e ON e."id" = vs."enrollment_id" AND TRUE ${byEnrollment}
        JOIN "app"."lessons" l ON l."id" = vs."lesson_id" AND TRUE ${byLesson}
        WHERE vs."started_at" >= ${since}
        GROUP BY 1
      `),
      this.prisma.$queryRaw<{ day: string; attempts: number; students: number }[]>(Prisma.sql`
        SELECT ${cairoDay('a."started_at"')} AS day,
               count(*)::int AS attempts,
               count(DISTINCT a."user_id")::int AS students
        FROM "app"."quiz_attempts" a
        JOIN "app"."quizzes" q ON q."id" = a."quiz_id"
        JOIN "app"."lessons" l ON l."id" = q."lesson_id" AND TRUE ${byLesson}
        WHERE a."started_at" >= ${since}
        GROUP BY 1
      `),
    ]);

    const watchByDay = new Map(watchRows.map((row) => [row.day, row]));
    const attemptByDay = new Map(attemptRows.map((row) => [row.day, row]));

    return dayKeys(since, new Date()).map((date) => {
      const watch = watchByDay.get(date);
      const attempt = attemptByDay.get(date);
      return {
        date,
        watchMinutes: (watch?.seconds ?? 0) / 60,
        attempts: attempt?.attempts ?? 0,
        // The union of the two, approximated by the larger. An exact distinct
        // union costs a third scan of both tables for a number that is read as
        // a trend line and never quoted as a headcount.
        activeStudents: Math.max(watch?.students ?? 0, attempt?.students ?? 0),
      };
    });
  }

  private async byYear(byEnrollment: Prisma.Sql, byLesson: Prisma.Sql): Promise<YearBreakdown[]> {
    const rows = await this.prisma.$queryRaw<
      { year: number; students: number; avg_completion: number | null; mean_score: number | null }[]
    >(Prisma.sql`
      WITH scoped AS (
        SELECT DISTINCT p."user_id", p."year"
        FROM "app"."student_profiles" p
        JOIN "app"."enrollments" e ON e."user_id" = p."user_id" AND e."status" = 'active' ${byEnrollment}
        WHERE p."year" IS NOT NULL
      ),
      completion AS (
        SELECT s."year", avg(lp."completion")::float AS value
        FROM scoped s
        JOIN "app"."enrollments" e ON e."user_id" = s."user_id" AND TRUE ${byEnrollment}
        JOIN "app"."lesson_progress" lp ON lp."enrollment_id" = e."id" AND lp."open_count" > 0
        JOIN "app"."lessons" l ON l."id" = lp."lesson_id" AND TRUE ${byLesson}
        GROUP BY s."year"
      ),
      scores AS (
        SELECT s."year", avg(a."scaled_score" / NULLIF(a."grade_out_of", 0))::float AS value
        FROM scoped s
        JOIN "app"."quiz_attempts" a ON a."user_id" = s."user_id"
          AND a."state" IN ('submitted', 'pending_review')
        JOIN "app"."quizzes" q ON q."id" = a."quiz_id"
        JOIN "app"."lessons" l ON l."id" = q."lesson_id" AND TRUE ${byLesson}
        GROUP BY s."year"
      )
      SELECT s."year"::int AS year,
             count(DISTINCT s."user_id")::int AS students,
             c.value AS avg_completion,
             sc.value AS mean_score
      FROM scoped s
      LEFT JOIN completion c ON c."year" = s."year"
      LEFT JOIN scores sc ON sc."year" = s."year"
      GROUP BY s."year", c.value, sc.value
      ORDER BY s."year"
    `);

    return rows.map((row) => ({
      year: row.year,
      students: row.students,
      avgCompletion: clampFraction(row.avg_completion),
      meanScore: clampFraction(row.mean_score),
    }));
  }

  /**
   * Top twelve by headcount, not all twenty-seven: the tail is single-digit
   * cohorts whose mean score is noise, and a bar chart of 27 rows is a table
   * pretending to be one.
   */
  private async byGovernorate(
    byEnrollment: Prisma.Sql,
    byLesson: Prisma.Sql,
  ): Promise<GovernorateBreakdown[]> {
    const rows = await this.prisma.$queryRaw<
      { code: string; name_ar: string; students: number; mean_score: number | null }[]
    >(Prisma.sql`
      WITH scoped AS (
        SELECT DISTINCT p."user_id", p."governorate_code"
        FROM "app"."student_profiles" p
        JOIN "app"."enrollments" e ON e."user_id" = p."user_id" AND e."status" = 'active' ${byEnrollment}
      ),
      scores AS (
        SELECT s."governorate_code" AS code,
               avg(a."scaled_score" / NULLIF(a."grade_out_of", 0))::float AS value
        FROM scoped s
        JOIN "app"."quiz_attempts" a ON a."user_id" = s."user_id"
          AND a."state" IN ('submitted', 'pending_review')
        JOIN "app"."quizzes" q ON q."id" = a."quiz_id"
        JOIN "app"."lessons" l ON l."id" = q."lesson_id" AND TRUE ${byLesson}
        GROUP BY 1
      )
      SELECT g."code" AS code, g."name_ar" AS name_ar,
             count(DISTINCT s."user_id")::int AS students,
             sc.value AS mean_score
      FROM scoped s
      JOIN "app"."governorates" g ON g."code" = s."governorate_code"
      LEFT JOIN scores sc ON sc.code = g."code"
      GROUP BY g."code", g."name_ar", sc.value
      ORDER BY students DESC, g."code"
      LIMIT 12
    `);

    return rows.map((row) => ({
      code: row.code,
      nameAr: row.name_ar,
      students: row.students,
      meanScore: clampFraction(row.mean_score),
    }));
  }
}
