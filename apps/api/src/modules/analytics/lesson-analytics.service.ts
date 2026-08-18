import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  EngagementSlice,
  LessonAnalyticsDetail,
  LessonAnalyticsRow,
  LessonStudentRow,
} from '@ayman/contracts/admin/analytics';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { bucketsFrom, clampFraction, durationBucketsFrom, gradeBandsFrom, rate, studentJoins } from './analytics-shared';

/** The raw shape every per-lesson aggregate comes back in. Kept flat and
 *  snake_cased exactly as Postgres returns it; `toRow` is the only translator. */
interface LessonAggregateRow {
  lesson_id: string;
  title: string;
  course_id: string;
  course_title: string;
  section_title: string;
  position: number;
  kind: string;
  video_duration: number | null;
  eligible: number;
  opened: number;
  completed: number;
  avg_completion: number | null;
  watch_seconds: number;
  quiz_id: string | null;
  quiz_attempts: number;
  quiz_participants: number;
  quiz_mean: number | null;
  quiz_median: number | null;
  quiz_passed: number;
  quiz_decided: number;
  quiz_median_seconds: number | null;
}

/**
 * Per-lesson analytics — «تحليل الدروس».
 *
 * The list answers one question for every lesson at once: of the students who
 * COULD watch it, how many did, how far did they get, and how did they do on
 * the quiz at the end. The detail answers the same question one student at a
 * time.
 *
 * ## `eligible` is per COURSE, not per lesson
 *
 * A lesson has no enrollment of its own — access is granted at the course
 * level — so "could have watched this" is "holds an active enrollment in this
 * lesson's course". That makes `openRate` comparable ACROSS lessons in a
 * course (the denominator is constant), which is the comparison the whole
 * table exists to support: the lesson where the line falls off a cliff is the
 * one to go and look at.
 *
 * Unpublished lessons are included and flagged by nothing — deliberately. A
 * draft lesson has no watchers, sorts to the bottom of every rate column, and
 * hiding it would mean the table's lesson count disagreed with the course's.
 *
 * ## Every numerator is drawn from the same set as the denominator
 *
 * Both lateral joins below filter on an ACTIVE enrollment, because `eligible`
 * does. Without that, a student who sat the quiz and later had their
 * enrollment cancelled — or who sat it having never been enrolled in the first
 * place — counts in the numerator and not in the denominator, and the rate
 * goes over 100%. It did: one lesson in the dev database reported a
 * participation rate above 1, which the contract's `max(1)` caught at the web
 * edge as a 500 on the whole page.
 *
 * `max(1)` is the right bound and is not what needed loosening. A rate over
 * 100% is not a number with a wider range, it is a numerator counting things
 * the denominator never could — so the fix belongs in the population, not the
 * schema.
 *
 * The same filter is applied to the DETAIL's distributions, so that a score
 * bucket divided by `quizAttempts` is a share of the attempts that bucket was
 * drawn from. Two populations behind one percentage is the subtler version of
 * the same bug, and it does not announce itself with a 500.
 */
@Injectable()
export class LessonAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  list(courseId: string | null): Promise<LessonAnalyticsRow[]> {
    return this.aggregate(
      courseId ? Prisma.sql`WHERE l."course_id" = ${courseId}::uuid` : Prisma.empty,
    );
  }

  private async aggregate(where: Prisma.Sql): Promise<LessonAnalyticsRow[]> {
    const rows = await this.prisma.$queryRaw<LessonAggregateRow[]>(Prisma.sql`
      SELECT
        l."id" AS lesson_id, l."title", l."course_id", c."title" AS course_title,
        s."title" AS section_title, l."position", l."kind"::text AS kind,
        v."duration_seconds" AS video_duration,
        -- The SAME population the roster below lists. It counted every active
        -- enrollment, so an instructor enrolled in his own course was one of
        -- his own «الطلبة المؤهلين» — and, because the roster can only list
        -- students who have a profile, the difference vanished into the
        -- engagement donut's «ولا حاجة» slice instead of showing up as a
        -- number that did not add up.
        (SELECT count(*)::int FROM "app"."enrollments" e
          ${studentJoins('e."user_id"')}
          WHERE e."course_id" = l."course_id" AND e."status" = 'active') AS eligible,
        COALESCE(p.opened, 0) AS opened,
        COALESCE(p.completed, 0) AS completed,
        p.avg_completion,
        COALESCE(p.watch_seconds, 0) AS watch_seconds,
        q."id" AS quiz_id,
        COALESCE(a.attempts, 0) AS quiz_attempts,
        COALESCE(a.participants, 0) AS quiz_participants,
        a.mean AS quiz_mean,
        a.median AS quiz_median,
        COALESCE(a.passed, 0) AS quiz_passed,
        COALESCE(a.decided, 0) AS quiz_decided,
        a.median_seconds AS quiz_median_seconds
      FROM "app"."lessons" l
      JOIN "app"."courses" c ON c."id" = l."course_id"
      JOIN "app"."course_sections" s ON s."id" = l."section_id"
      LEFT JOIN "app"."lesson_videos" v ON v."lesson_id" = l."id"
      LEFT JOIN "app"."quizzes" q ON q."lesson_id" = l."id"
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS opened,
               count(*) FILTER (WHERE lp."state" IN ('completed', 'passed'))::int AS completed,
               avg(lp."completion")::float AS avg_completion,
               sum(lp."watched_seconds")::int AS watch_seconds
        FROM "app"."lesson_progress" lp
        JOIN "app"."enrollments" pe ON pe."id" = lp."enrollment_id" AND pe."status" = 'active'
        ${studentJoins('pe."user_id"')}
        WHERE lp."lesson_id" = l."id" AND lp."open_count" > 0
      ) p ON TRUE
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS attempts,
               count(DISTINCT at."user_id")::int AS participants,
               avg(at."scaled_score" / NULLIF(at."grade_out_of", 0))::float AS mean,
               percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY at."scaled_score" / NULLIF(at."grade_out_of", 0)
               )::float AS median,
               count(*) FILTER (WHERE at."passed" IS TRUE)::int AS passed,
               count(*) FILTER (WHERE at."passed" IS NOT NULL)::int AS decided,
               percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY EXTRACT(EPOCH FROM (at."submitted_at" - at."started_at"))
               ) FILTER (WHERE at."submitted_at" >= at."started_at")::float AS median_seconds
        FROM "app"."quiz_attempts" at
        JOIN "app"."enrollments" ae
          ON ae."user_id" = at."user_id" AND ae."course_id" = l."course_id" AND ae."status" = 'active'
        ${studentJoins('at."user_id"')}
        WHERE at."quiz_id" = q."id" AND at."state" IN ('submitted', 'pending_review')
      ) a ON TRUE
      ${where}
      ORDER BY c."title", s."position", l."position"
    `);

    // The quiz title is the lesson title: a quiz has no title column of its
    // own (see `Quiz` — it is 1:1 with its lesson and named by it).
    return rows.map((row) => toRow(row));
  }

  async detail(lessonId: string): Promise<LessonAnalyticsDetail> {
    const [summary] = await this.aggregate(Prisma.sql`WHERE l."id" = ${lessonId}::uuid`);
    if (!summary) throw new NotFoundException();

    const [students, completionRows, attemptRows] = await Promise.all([
      this.students(lessonId),
      this.prisma.$queryRaw<{ bucket: number; n: number }[]>(Prisma.sql`
        SELECT LEAST(width_bucket(lp."completion", 0, 1, 10), 10)::int AS bucket, count(*)::int AS n
        FROM "app"."lesson_progress" lp
        JOIN "app"."enrollments" e ON e."id" = lp."enrollment_id" AND e."status" = 'active'
        ${studentJoins('e."user_id"')}
        WHERE lp."lesson_id" = ${lessonId}::uuid AND lp."open_count" > 0
        GROUP BY 1 ORDER BY 1
      `),
      this.prisma.$queryRaw<{ frac: number | null; secs: number | null }[]>(Prisma.sql`
        SELECT (a."scaled_score" / NULLIF(a."grade_out_of", 0))::float AS frac,
               CASE WHEN a."submitted_at" >= a."started_at"
                    THEN EXTRACT(EPOCH FROM (a."submitted_at" - a."started_at"))::int END AS secs
        FROM "app"."quiz_attempts" a
        JOIN "app"."quizzes" q ON q."id" = a."quiz_id"
        JOIN "app"."lessons" l ON l."id" = q."lesson_id"
        JOIN "app"."enrollments" e
          ON e."user_id" = a."user_id" AND e."course_id" = l."course_id" AND e."status" = 'active'
        ${studentJoins('a."user_id"')}
        WHERE q."lesson_id" = ${lessonId}::uuid AND a."state" IN ('submitted', 'pending_review')
      `),
    ]);

    const fractions = attemptRows
      .map((row) => clampFraction(row.frac))
      .filter((value): value is number => value !== null);
    const seconds = attemptRows
      .map((row) => row.secs)
      .filter((value): value is number => value !== null);

    return {
      summary,
      completionBuckets: completionRows,
      scoreBuckets: bucketsFrom(fractions),
      gradeBands: gradeBandsFrom(fractions),
      durationBuckets: durationBucketsFrom(seconds),
      engagement: engagementOf(students, summary.eligible),
      students,
    };
  }

  /**
   * The roster: EVERY eligible student, including the ones who never opened
   * the lesson. Those rows are the reason to look at this screen at all, and a
   * list built by joining outward from `lesson_progress` cannot contain them.
   */
  private async students(lessonId: string): Promise<LessonStudentRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        user_id: string;
        full_name: string;
        year: number | null;
        governorate: string | null;
        watched_seconds: number;
        completion: number;
        state: string;
        open_count: number;
        last_seen_at: Date | null;
        attempts: number;
        best: number | null;
        last: number | null;
        passed: boolean | null;
        secs: number | null;
      }[]
    >(Prisma.sql`
      WITH lesson AS (
        SELECT l."id", l."course_id", q."id" AS quiz_id
        FROM "app"."lessons" l
        LEFT JOIN "app"."quizzes" q ON q."lesson_id" = l."id"
        WHERE l."id" = ${lessonId}::uuid
      )
      SELECT
        e."user_id",
        pr."full_name",
        pr."year"::int AS year,
        g."name_ar" AS governorate,
        COALESCE(lp."watched_seconds", 0) AS watched_seconds,
        COALESCE(lp."completion", 0)::float AS completion,
        COALESCE(lp."state"::text, 'not_started') AS state,
        COALESCE(lp."open_count", 0) AS open_count,
        lp."last_heartbeat_at" AS last_seen_at,
        COALESCE(a.attempts, 0) AS attempts,
        a.best, a.last, a.passed, a.secs
      FROM lesson ls
      JOIN "app"."enrollments" e ON e."course_id" = ls."course_id" AND e."status" = 'active'
      JOIN "app"."users" u ON u."id" = e."user_id" AND u."role" = 'student'
      JOIN "app"."student_profiles" pr ON pr."user_id" = e."user_id"
      LEFT JOIN "app"."governorates" g ON g."code" = pr."governorate_code"
      LEFT JOIN "app"."lesson_progress" lp
             ON lp."enrollment_id" = e."id" AND lp."lesson_id" = ls."id"
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS attempts,
               max(at."scaled_score" / NULLIF(at."grade_out_of", 0))::float AS best,
               (array_agg(
                  (at."scaled_score" / NULLIF(at."grade_out_of", 0))::float
                  ORDER BY at."attempt_no" DESC
                ))[1] AS last,
               bool_or(at."passed") AS passed,
               (array_agg(
                  CASE WHEN at."submitted_at" >= at."started_at"
                       THEN EXTRACT(EPOCH FROM (at."submitted_at" - at."started_at"))::int END
                  ORDER BY at."attempt_no" DESC
                ))[1] AS secs
        FROM "app"."quiz_attempts" at
        WHERE at."quiz_id" = ls."quiz_id" AND at."user_id" = e."user_id"
          AND at."state" IN ('submitted', 'pending_review')
      ) a ON TRUE
      ORDER BY COALESCE(lp."watched_seconds", 0) DESC, pr."full_name"
    `);

    return rows.map((row) => ({
      userId: row.user_id,
      fullName: row.full_name,
      year: row.year,
      governorateNameAr: row.governorate,
      watchedSeconds: row.watched_seconds,
      completion: clampFraction(row.completion) ?? 0,
      state: row.state,
      openCount: row.open_count,
      lastSeenAt: row.last_seen_at?.toISOString() ?? null,
      attempts: row.attempts,
      bestScore: clampFraction(row.best),
      lastScore: clampFraction(row.last),
      passed: row.passed,
      quizSeconds: row.secs,
    }));
  }
}

function toRow(row: LessonAggregateRow): LessonAnalyticsRow {
  const watchHours = row.watch_seconds / 3600;
  return {
    lessonId: row.lesson_id,
    title: row.title,
    courseId: row.course_id,
    courseTitle: row.course_title,
    sectionTitle: row.section_title,
    position: row.position,
    kind: row.kind,
    hasVideo: row.video_duration !== null,
    videoDurationSeconds: row.video_duration,

    eligible: row.eligible,
    opened: row.opened,
    openRate: rate(row.opened, row.eligible),
    completed: row.completed,
    completionRate: rate(row.completed, row.eligible),
    avgCompletion: clampFraction(row.avg_completion),
    watchHours,
    avgWatchSeconds: row.opened > 0 ? row.watch_seconds / row.opened : null,

    quizId: row.quiz_id,
    quizTitle: row.quiz_id === null ? null : row.title,
    quizAttempts: row.quiz_attempts,
    quizParticipants: row.quiz_participants,
    quizParticipationRate: row.quiz_id === null ? null : rate(row.quiz_participants, row.eligible),
    quizMeanScore: clampFraction(row.quiz_mean),
    quizMedianScore: clampFraction(row.quiz_median),
    quizPassRate: rate(row.quiz_passed, row.quiz_decided),
    quizMedianDurationSeconds: row.quiz_median_seconds,
  };
}

/** The same four mutually exclusive states the overview uses, derived from the
 *  roster rather than re-queried — the roster already IS the eligible set. */
function engagementOf(students: readonly LessonStudentRow[], eligible: number): EngagementSlice[] {
  let both = 0;
  let videoOnly = 0;
  let quizOnly = 0;
  for (const student of students) {
    const watched = student.watchedSeconds > 0;
    const sat = student.attempts > 0;
    if (watched && sat) both += 1;
    else if (watched) videoOnly += 1;
    else if (sat) quizOnly += 1;
  }
  return [
    { segment: 'both', n: both },
    { segment: 'videoOnly', n: videoOnly },
    { segment: 'quizOnly', n: quizOnly },
    { segment: 'neither', n: Math.max(0, eligible - both - videoOnly - quizOnly) },
  ];
}
