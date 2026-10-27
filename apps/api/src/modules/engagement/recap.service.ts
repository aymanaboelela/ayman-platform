import { Injectable } from '@nestjs/common';
import { daysInMonthKey, type RecapPayload } from '@ayman/contracts/engagement';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { cairoDate, cairoDayKey, cairoHour } from '../analytics/analytics-shared';

/** How far back the month picker reaches. */
const MONTHS_BACK = 6;
/** Until this day of a month, «ملخص الشهر» opens on the month that just ended. */
const LAST_MONTH_UNTIL_DAY = 7;

function monthOf(day: string): string {
  return day.slice(0, 7);
}

function shiftMonth(month: string, by: number): string {
  const [year, mm] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, mm - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * The month to open on: the one that just ended during its first week (it is
 * the one worth sharing), the running one after that.
 */
export function defaultRecapMonth(today: string, months: readonly string[]): string {
  const current = monthOf(today);
  const previous = shiftMonth(current, -1);
  return Number(today.slice(8, 10)) <= LAST_MONTH_UNTIL_DAY && months.includes(previous) ? previous : current;
}

interface WatchRow {
  seconds: number;
  top_course: string | null;
  top_seconds: number | null;
  peak_hour: number | null;
}

interface CountRow {
  lessons: number;
  quizzes: number;
  average: number | null;
  best_title: string | null;
  best_percent: number | null;
  active_days: number;
  daily_answered: number;
  daily_right: number;
  notes: number;
  badges: number;
}

/**
 * «ملخص الشهر» — a month of one student's work, in numbers.
 *
 * A pure read: every figure is a COUNT over rows that already exist, bounded
 * by Cairo calendar days (`cairoDate`), so a lecture watched at 00:30 on the
 * first belongs to the new month. Each bound also carries a coarse UTC range
 * (±1 day) in front of the Cairo test, so Postgres can use the per-user time
 * indexes before it formats a single date.
 */
@Injectable()
export class RecapService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string, requested: string | null, now: Date = new Date()): Promise<RecapPayload> {
    const today = cairoDayKey(now);
    const current = monthOf(today);
    const months = await this.activeMonths(userId, current);
    const month = requested && months.includes(requested) ? requested : defaultRecapMonth(today, months);

    const from = `${month}-01`;
    const to = `${shiftMonth(month, 1)}-01`;
    const lower = new Date(`${from}T00:00:00Z`);
    lower.setUTCDate(lower.getUTCDate() - 1);
    const upper = new Date(`${to}T00:00:00Z`);
    upper.setUTCDate(upper.getUTCDate() + 1);

    const inMonth = (column: string) => Prisma.sql`
      ${Prisma.raw(column)} >= ${lower} AND ${Prisma.raw(column)} < ${upper}
      AND ${cairoDate(column)} >= ${from}::date AND ${cairoDate(column)} < ${to}::date`;

    const [watch, counts] = await Promise.all([
      this.prisma.$queryRaw<WatchRow[]>(Prisma.sql`
        WITH s AS (
          SELECT v."watched_seconds", e."course_id", ${cairoHour('v."started_at"')} AS hour
          FROM "app"."lesson_view_sessions" v
          JOIN "app"."enrollments" e ON e."id" = v."enrollment_id"
          WHERE e."user_id" = ${userId} AND ${inMonth('v."started_at"')}
        ),
        per_course AS (
          SELECT "course_id", sum("watched_seconds")::int AS seconds FROM s GROUP BY "course_id"
          ORDER BY seconds DESC LIMIT 1
        ),
        per_hour AS (
          SELECT hour, sum("watched_seconds") AS seconds FROM s GROUP BY hour
          ORDER BY seconds DESC, hour LIMIT 1
        )
        SELECT
          COALESCE((SELECT sum("watched_seconds") FROM s), 0)::int AS seconds,
          (SELECT c."title" FROM per_course pc JOIN "app"."courses" c ON c."id" = pc."course_id") AS top_course,
          (SELECT seconds FROM per_course) AS top_seconds,
          (SELECT hour FROM per_hour WHERE seconds > 0) AS peak_hour
      `),
      this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
        WITH graded AS (
          SELECT a."scaled_score" / a."grade_out_of" * 100 AS percent, l."title"
          FROM "app"."quiz_attempts" a
          JOIN "app"."quizzes" q ON q."id" = a."quiz_id"
          JOIN "app"."lessons" l ON l."id" = q."lesson_id"
          WHERE a."user_id" = ${userId} AND a."state" = 'submitted'
            AND a."grade_out_of" > 0 AND a."scaled_score" IS NOT NULL
            AND ${inMonth('a."submitted_at"')}
        ),
        best AS (SELECT "title", percent FROM graded ORDER BY percent DESC LIMIT 1),
        active AS (
          SELECT ${cairoDate('v."started_at"')} AS day
          FROM "app"."lesson_view_sessions" v
          JOIN "app"."enrollments" e ON e."id" = v."enrollment_id"
          WHERE e."user_id" = ${userId} AND ${inMonth('v."started_at"')}
          UNION
          SELECT ${cairoDate('a."submitted_at"')} FROM "app"."quiz_attempts" a
          WHERE a."user_id" = ${userId} AND a."submitted_at" IS NOT NULL AND ${inMonth('a."submitted_at"')}
          UNION
          SELECT d."day" FROM "app"."daily_answers" d
          WHERE d."user_id" = ${userId} AND d."answered_at" IS NOT NULL
            AND d."day" >= ${from}::date AND d."day" < ${to}::date
        )
        SELECT
          (SELECT count(*) FROM "app"."lesson_progress" lp
             JOIN "app"."enrollments" e ON e."id" = lp."enrollment_id"
             JOIN "app"."lessons" l ON l."id" = lp."lesson_id"
            WHERE e."user_id" = ${userId} AND l."kind" <> 'quiz' AND ${inMonth('lp."completed_at"')})::int AS lessons,
          (SELECT count(*) FROM "app"."quiz_attempts" a
            WHERE a."user_id" = ${userId} AND a."state" IN ('submitted', 'pending_review')
              AND ${inMonth('a."submitted_at"')})::int AS quizzes,
          (SELECT avg(percent)::float8 FROM graded) AS average,
          (SELECT "title" FROM best) AS best_title,
          (SELECT percent::float8 FROM best) AS best_percent,
          (SELECT count(*) FROM active)::int AS active_days,
          (SELECT count(*) FROM "app"."daily_answers" d
            WHERE d."user_id" = ${userId} AND d."answered_at" IS NOT NULL
              AND d."day" >= ${from}::date AND d."day" < ${to}::date)::int AS daily_answered,
          (SELECT count(*) FROM "app"."daily_answers" d
            WHERE d."user_id" = ${userId} AND d."was_right"
              AND d."day" >= ${from}::date AND d."day" < ${to}::date)::int AS daily_right,
          (SELECT count(*) FROM "app"."lesson_notes" n
            WHERE n."user_id" = ${userId} AND ${inMonth('n."created_at"')})::int AS notes,
          (SELECT count(*) FROM "app"."student_badges" b
            WHERE b."user_id" = ${userId} AND ${inMonth('b."earned_at"')})::int AS badges
      `),
    ]);

    const w = watch[0];
    const c = counts[0];
    const clamp = (value: number | null | undefined) =>
      value === null || value === undefined ? null : Math.round(Math.min(100, Math.max(0, value)));
    const bestPercent = clamp(c?.best_percent);

    return {
      month,
      months,
      partial: month === current,
      watchMinutes: Math.round((w?.seconds ?? 0) / 60),
      lessonsCompleted: c?.lessons ?? 0,
      quizzesTaken: c?.quizzes ?? 0,
      averagePercent: clamp(c?.average),
      best: c?.best_title && bestPercent !== null ? { title: c.best_title, percent: bestPercent } : null,
      activeDays: c?.active_days ?? 0,
      daysInMonth: daysInMonthKey(month),
      dailyAnswered: c?.daily_answered ?? 0,
      dailyRight: c?.daily_right ?? 0,
      notesWritten: c?.notes ?? 0,
      badgesEarned: c?.badges ?? 0,
      topCourse:
        w?.top_course && (w.top_seconds ?? 0) > 0
          ? { title: w.top_course, minutes: Math.round((w.top_seconds ?? 0) / 60) }
          : null,
      peakHour: w?.peak_hour ?? null,
    };
  }

  /**
   * The months worth a recap — any with a watched lecture or a sitting —
   * newest first, the running month always among them so the page has
   * somewhere to land on a student's first day.
   */
  private async activeMonths(userId: string, current: string): Promise<string[]> {
    const since = new Date(`${shiftMonth(current, -(MONTHS_BACK - 1))}-01T00:00:00Z`);
    since.setUTCDate(since.getUTCDate() - 1);
    const rows = await this.prisma.$queryRaw<Array<{ month: string }>>(Prisma.sql`
      SELECT DISTINCT to_char(day, 'YYYY-MM') AS month FROM (
        SELECT ${cairoDate('v."started_at"')} AS day
        FROM "app"."lesson_view_sessions" v
        JOIN "app"."enrollments" e ON e."id" = v."enrollment_id"
        WHERE e."user_id" = ${userId} AND v."started_at" >= ${since}
        UNION
        SELECT ${cairoDate('a."submitted_at"')} FROM "app"."quiz_attempts" a
        WHERE a."user_id" = ${userId} AND a."submitted_at" >= ${since}
      ) x
    `);
    const floor = shiftMonth(current, -(MONTHS_BACK - 1));
    const found = new Set(rows.map((row) => row.month).filter((month) => month >= floor && month <= current));
    found.add(current);
    return [...found].sort().reverse();
  }
}
