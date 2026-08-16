import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  DailyPoint,
  StudentAnalyticsDetail,
  StudentAnalyticsRow,
  StudentAttemptRow,
  StudentCourseRow,
  StudentDevices,
  StudentLessonRow,
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
/** How long a cohort average may be reused. See `cohort()`. */
const COHORT_TTL_MS = 60_000;

/**
 * Ceilings on the two unbounded per-student lists.
 *
 * Both are "everything about this one student", which is small for a real
 * student and unbounded in principle — a seeded account or a scripted client
 * can hold thousands of rows, and this response is parsed by Zod at the web
 * edge before a single byte renders. The caps are far above any real record
 * and exist so one anomalous account cannot make the page fail to load at all.
 */
const LESSON_ROW_LIMIT = 500;
const DEVICE_ROW_LIMIT = 50;

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

    // One round of parallel reads, not a waterfall. Adding the two new blocks
    // here rather than in their own request is the whole reason the student
    // record can be one server render.
    const [cohort, courses, lessons, attempts, devices, daily] = await Promise.all([
      this.cohort(),
      this.courses(userId),
      this.lessons(userId),
      this.attempts(userId),
      this.devices(userId),
      this.daily(userId),
    ]);

    const fractions = attempts
      .map((attempt) => attempt.score)
      .filter((value): value is number => value !== null);

    return {
      summary: toRow(row),
      cohort,
      courses,
      lessons,
      attempts,
      devices,
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

  /**
   * The class average on the same four measures. Every number on a student's
   * page is rendered against this — a lone «٦٨٪» answers nothing.
   *
   * ## Why this one is memoised and none of the others are
   *
   * Every other query here is bounded by `user_id`. This one is deliberately
   * not: it is five uncorrelated aggregates over the WHOLE of
   * `lesson_progress` and `quiz_attempts`, including a `percentile_cont` that
   * sorts every graded attempt on the platform, and `lesson_progress` has no
   * index covering `open_count > 0`. Its cost grows with the platform and is
   * identical for every student.
   *
   * It used to be paid only by the analytics screen. This response now also
   * backs the ordinary admin student record — the page an operator opens to
   * check a phone number — so the same full scan would run on a read that has
   * nothing to do with analytics. A short TTL keeps the comparison honest
   * (nobody can perceive a class average being a minute stale) while making
   * the cost per-minute rather than per-page-view.
   *
   * In-process and per-instance on purpose: it is a cache of a number that is
   * already approximate, so a second API replica holding its own copy is not a
   * correctness problem, and it needs no Redis round trip to be worth having.
   */
  private async cohort(): Promise<StudentAnalyticsDetail['cohort']> {
    const cached = StudentAnalyticsService.cohortCache;
    if (cached && Date.now() - cached.at < COHORT_TTL_MS) return cached.value;

    const value = await this.cohortUncached();
    StudentAnalyticsService.cohortCache = { at: Date.now(), value };
    return value;
  }

  private static cohortCache: { at: number; value: StudentAnalyticsDetail['cohort'] } | null = null;

  private async cohortUncached(): Promise<StudentAnalyticsDetail['cohort']> {
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
   * Every lesson this student has ever OPENED, most recently touched first.
   *
   * `open_count > 0` is the same predicate the rollups use, and it is what
   * makes this "what he did" rather than "what he was enrolled in": a course
   * with two hundred lessons would otherwise contribute two hundred untouched
   * rows and bury the four he actually watched.
   *
   * ONE joined query with a LIMIT, not a loop over `courses[]`. The obvious
   * shape — list the courses, then fetch each course's lesson rows — is an
   * N+1 that grows with enrolment count on a page that already issues six
   * reads.
   *
   * Ordered on `last_heartbeat_at DESC NULLS LAST`: the most recent thing they
   * touched is the answer to "what is he doing", and a lesson opened once
   * before heartbeats existed has no timestamp to sort by and belongs last
   * rather than first.
   */
  private async lessons(userId: string): Promise<StudentLessonRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        lesson_id: string;
        lesson_title: string;
        course_id: string;
        course_title: string;
        state: string;
        completion: number | null;
        watched_seconds: number;
        open_count: number;
        last_seen_at: Date | null;
        completed_at: Date | null;
        completed_via: string | null;
      }[]
    >(Prisma.sql`
      SELECT l."id" AS lesson_id, l."title" AS lesson_title,
             c."id" AS course_id, c."title" AS course_title,
             lp."state"::text AS state,
             lp."completion"::float AS completion,
             lp."watched_seconds", lp."open_count",
             lp."last_heartbeat_at" AS last_seen_at,
             lp."completed_at",
             lp."completed_via"::text AS completed_via
      FROM "app"."enrollments" e
      JOIN "app"."lesson_progress" lp ON lp."enrollment_id" = e."id"
      JOIN "app"."lessons" l ON l."id" = lp."lesson_id"
      JOIN "app"."courses" c ON c."id" = e."course_id"
      WHERE e."user_id" = ${userId} AND lp."open_count" > 0
      ORDER BY lp."last_heartbeat_at" DESC NULLS LAST, l."title" ASC
      LIMIT ${LESSON_ROW_LIMIT}
    `);

    return rows.map((row) => ({
      lessonId: row.lesson_id,
      lessonTitle: row.lesson_title,
      courseId: row.course_id,
      courseTitle: row.course_title,
      state: row.state,
      completion: clampFraction(row.completion),
      watchedSeconds: row.watched_seconds,
      openCount: row.open_count,
      lastSeenAt: row.last_seen_at?.toISOString() ?? null,
      completedAt: row.completed_at?.toISOString() ?? null,
      completedVia: row.completed_via,
    }));
  }

  /**
   * Which devices this ACCOUNT signs in from — and nothing stronger than that.
   * See `StudentDevicesSchema` for why no per-lesson or per-attempt device
   * attribution is possible and must not be implied on screen.
   *
   * A raw LEFT JOIN rather than a Prisma `include`, and not optionally:
   * `SessionDevice.sessionId` is a plain indexed column, deliberately NOT a
   * `@relation` (the schema explains why — revoking a device deletes the
   * `Session` row while this row survives with `revokedAt` set), so there is
   * no relation for `include` to traverse. The join is also why `lastActiveAt`
   * can be a real rolling timestamp: `session_devices.last_seen_at` is written
   * once at insert and never updated, so it always equals the login.
   *
   * The type counts come from a second `GROUP BY` over the student's WHOLE
   * login history rather than from the capped page — see the comment on that
   * query for the ordinary case that made deriving them from the page wrong.
   */
  private async devices(userId: string): Promise<StudentDevices> {
    const [rows, totals, [ban]] = await Promise.all([
      this.prisma.$queryRaw<
        {
          id: string;
          device_name: string;
          device_type: string;
          logged_in_at: Date;
          last_active_at: Date | null;
          revoked_at: Date | null;
        }[]
      >(Prisma.sql`
        SELECT d."id", d."device_name", d."device_type",
               d."logged_in_at", d."revoked_at",
               s."updated_at" AS last_active_at
        FROM "app"."session_devices" d
        LEFT JOIN "app"."sessions" s ON s."id" = d."session_id"
        WHERE d."user_id" = ${userId}
        ORDER BY d."logged_in_at" DESC
        LIMIT ${DEVICE_ROW_LIMIT}
      `),
      /*
       * Counted in the database over the WHOLE history, not in JS over the
       * page above — that was the first version of this and it was wrong in
       * the ordinary case, not an exotic one. A row is written per SIGN-IN,
       * so a student who opens the app each morning passes fifty rows within
       * a term and the headline would have frozen at «٥٠», silently, while
       * the type split quietly became "the last fifty logins" instead of the
       * student's habits.
       */
      this.prisma.$queryRaw<{ device_type: string; logins: number; devices: number }[]>(
        Prisma.sql`
          SELECT d."device_type",
                 count(*)::int AS logins,
                 count(DISTINCT d."device_name")::int AS devices
          FROM "app"."session_devices" d
          WHERE d."user_id" = ${userId}
          GROUP BY d."device_type"
        `,
      ),
      /*
       * "Was this account EVER banned", not "is it banned now".
       *
       * `StudentsService.ban` deletes the device rows and `unban` cannot
       * restore them — its own docblock says so. Keying the empty-state
       * message on the live `banned_at` therefore gets the case backwards the
       * moment a ban is lifted: the rows are still gone, the flag flips to
       * false, and the card tells the operator «عمره ما دخل من أي جهاز» about
       * a student with a long login history. An admin who bans by mistake and
       * immediately undoes it reads that sentence on the very same screen.
       *
       * The audit row is the only trace of the deletion that survives, and it
       * is indexed on exactly this pair.
       */
      this.prisma.$queryRaw<{ ever_banned: boolean }[]>(Prisma.sql`
        SELECT EXISTS (
          SELECT 1 FROM "app"."audit_log" a
          WHERE a."resource_type" = 'user'
            AND a."resource_id" = ${userId}
            AND a."action" = 'student:ban'
            AND a."outcome" = 'success'
        ) AS ever_banned
      `),
    ]);

    return {
      logins: totals.reduce((sum, row) => sum + row.logins, 0),
      // Summed across types rather than a separate global `count(DISTINCT
      // device_name)`: the name embeds the OS («Safari على iOS»), so one name
      // never spans two form factors and the sum is the same number for one
      // fewer round trip.
      distinctDevices: totals.reduce((sum, row) => sum + row.devices, 0),
      byType: totals
        .map((row) => ({ type: row.device_type, logins: row.logins, devices: row.devices }))
        .sort((a, b) => b.logins - a.logins || a.type.localeCompare(b.type)),
      // The rows are already newest-first, so the first one is the last login.
      lastLoginAt: rows[0]?.logged_in_at.toISOString() ?? null,
      recent: rows.map((row) => ({
        id: row.id,
        deviceName: row.device_name,
        deviceType: row.device_type,
        loggedInAt: row.logged_in_at.toISOString(),
        lastActiveAt: row.last_active_at?.toISOString() ?? null,
        revoked: row.revoked_at !== null,
      })),
      // Only meaningful when the list is empty: a student whose rows a ban
      // deleted looks identical to one who has none, and the two empty states
      // say opposite things.
      clearedByBan: totals.length === 0 && (ban?.ever_banned ?? false),
    };
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
