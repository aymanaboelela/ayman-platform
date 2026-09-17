import { Injectable, Logger } from '@nestjs/common';
import type { OutreachFacts } from '@ayman/contracts/outreach/compose';
import {
  FOLLOW_UP_COOLDOWN_DAYS,
  OUTREACH_SEND_ALL_MAX,
  type FollowUpQuery,
  type FollowUpRow,
  type IdleQuery,
  type IdleRow,
  type OutreachSendResult,
} from '@ayman/contracts/outreach/follow-up';
import { loadEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { OutreachService, type DeliveryContext, type DeliveryOutcome } from '../outreach/outreach.service';
import { Prisma } from '../../generated/prisma/client';

/**
 * «مين وقف، ومين دخل ومشترَكش» — the two selections behind `/admin/follow-up`.
 *
 * ## Both selections are ONE statement each, and that is the design
 *
 * The obvious implementation reads the enrolled students, then loops asking
 * "did this one watch the last two lectures". On the cohort this platform
 * already has that is thousands of round trips per page load, and it gets
 * slower exactly as the platform succeeds. Both queries below are single
 * statements with the selection expressed in SQL, for the same reason
 * `StudentAnalyticsService` argues its sort has to be: page one of a
 * client-side filter is not page one of the answer.
 *
 * ## «آخر محاضرتين» is the tail of the OUTLINE, not the newest by date
 *
 * `lessons.publish_at` is cleared by `LessonPublishSweeper` the moment it
 * fires, and `created_at` is when the row was authored — an instructor who
 * drafts a whole unit in one evening and releases it over a month would order
 * wrongly by either. The outline order (section, then position) is the order
 * the student is asked to walk it in, so the last N of it is what «الأخيرة»
 * means to both of them.
 *
 * ## A student is only listed when they missed EVERY lesson in the window
 *
 * Not «missed at least two of the recent ones» — «ما شافش آخر محاضرتين» says
 * the last two, both of them. A course with only one published quiz can
 * therefore still produce a quiz row (the window is capped at what exists),
 * and a student who watched one of the two lectures produces none. The looser
 * rule was tried first and listed most of the cohort, which is a screen nobody
 * opens twice.
 *
 * ⚠️ That rule decides WHO is listed, not WHAT the message names. Once a
 * student is in the list — for either reason — every lecture and every quiz
 * they missed inside the window is named. The alternative is writing «الكويز
 * لسه فاضي» to somebody who also skipped a lecture and saying nothing about
 * it, which is an incomplete message rather than a shorter one.
 */

/** Course, lesson and quiz rows the two selections share. */
const ACTIVE_ENROLLMENT = Prisma.sql`
  e."status" = 'active' AND (e."expires_at" IS NULL OR e."expires_at" > now())`;

/**
 * The published courses a profile's own year and stream point at.
 *
 * `pr` must be a `student_profiles` alias and `c` a `courses` alias in the
 * enclosing scope. Written once because the idle selection asks it three
 * times — as a count, as a filter and as the suggestion — and three copies of
 * a predicate this fiddly is three chances to disagree about who is «في
 * مكانه».
 *
 * ⚠️ `pr.year IS NOT NULL` is load-bearing, not defensive. Most profiles on
 * this platform have never been asked for a year (onboarding is not enforced
 * retroactively), and without this a null year matches nothing, every one of
 * those students reads as «مشترك في الحتة الغلط», and the platform starts
 * telling people who are studying perfectly happily that they are in the wrong
 * course. `FollowUpService.idle` keeps them out of `elsewhere` entirely.
 */
const COURSE_FITS_PROFILE = Prisma.sql`
  c."status" = 'published'
  AND pr."year" IS NOT NULL
  AND c."year" = pr."year"
  AND (
    pr."school_stream" IS NULL
    OR (pr."school_stream" = 'general' AND c."for_general")
    OR (pr."school_stream" = 'languages' AND c."for_languages")
  )
  AND (c."track_id" IS NULL OR pr."track_id" IS NULL OR c."track_id" = pr."track_id")`;

interface AtRiskRow {
  user_id: string;
  student_name: string;
  phone: string;
  year: number | null;
  school_stream: 'general' | 'languages' | null;
  course_id: string;
  course_title: string;
  missed_lessons: { id: string; title: string }[] | null;
  missed_quizzes: { id: string; title: string }[] | null;
  last_active: Date | null;
  last_messaged: Date | null;
}

interface IdleDbRow {
  user_id: string;
  student_name: string;
  phone: string | null;
  has_profile: boolean;
  year: number | null;
  school_stream: 'general' | 'languages' | null;
  enrolled: number;
  suggested_id: string | null;
  suggested_title: string | null;
  suggested_slug: string | null;
  created_at: Date;
  last_messaged: Date | null;
}

@Injectable()
export class FollowUpService {
  private readonly logger = new Logger(FollowUpService.name);
  private appUrlCache: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outreach: OutreachService,
  ) {}

  /**
   * Where the course cards in `subscribe_nudge` point.
   *
   * Read on first send rather than in the constructor, and that is not a
   * micro-optimisation: `loadEnv` validates the WHOLE environment and throws
   * naming every missing key, so doing it here would make constructing this
   * service require Redis, Better Auth and the media origin to be configured
   * — which is what it did, and what stopped its own unit spec from running
   * at all. Nothing is lost by deferring: `main.ts` calls `loadEnv` at boot,
   * so a deployment with a bad `APP_URL` still refuses to start; this read
   * can only ever see an environment that has already passed.
   */
  private get appUrl(): string {
    this.appUrlCache ??= loadEnv(process.env).APP_URL.replace(/\/+$/, '');
    return this.appUrlCache;
  }

  // ── «وقف في نص الطريق» ────────────────────────────────────────────────

  async atRisk(
    query: FollowUpQuery,
    take: number,
    skip: number,
  ): Promise<{ rows: FollowUpRow[]; rowCount: number }> {
    const selection = this.atRiskSelection(query, null);

    const [rows, counted] = await Promise.all([
      this.prisma.$queryRaw<AtRiskRow[]>(Prisma.sql`
        ${selection}
        SELECT * FROM picked
        ORDER BY
          (jsonb_array_length(COALESCE(missed_lessons, '[]'::jsonb))
           + jsonb_array_length(COALESCE(missed_quizzes, '[]'::jsonb))) DESC,
          last_active ASC NULLS FIRST,
          -- The id tiebreak is not cosmetic: two students with the same count
          -- and a null last_active are otherwise ordered by whatever the
          -- planner returns, and under LIMIT/OFFSET that duplicates one row
          -- onto page two and drops another entirely.
          user_id ASC, course_id ASC
        LIMIT ${take} OFFSET ${skip}
      `),
      this.prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
        ${selection}
        SELECT count(*)::bigint AS n FROM picked
      `),
    ]);

    return {
      rows: rows.map((row) => this.toFollowUpRow(row)),
      rowCount: Number(counted[0]?.n ?? 0),
    };
  }

  /**
   * The CTE chain both the page and the count run over.
   *
   * `userId` narrows it to one student for the send path, which is what makes
   * the message provably about the same facts the screen displayed: there is
   * one definition of «فاته إيه» in this file and the send re-runs it rather
   * than trusting a list of titles posted back from a browser.
   */
  private atRiskSelection(query: FollowUpQuery, userId: string | null): Prisma.Sql {
    const courseFilter = query.courseId
      ? Prisma.sql`AND c."id" = ${query.courseId}::uuid`
      : Prisma.empty;
    const yearFilter =
      query.year === undefined ? Prisma.empty : Prisma.sql`AND pr."year" = ${query.year}`;
    const userFilter = userId ? Prisma.sql`AND e."user_id" = ${userId}` : Prisma.empty;

    return Prisma.sql`
      WITH ranked AS (
        SELECT l."id", l."course_id", l."title", l."kind",
               row_number() OVER (
                 PARTITION BY l."course_id", l."kind"
                 ORDER BY s."position" DESC, l."position" DESC
               ) AS rn
        FROM "app"."lessons" l
        JOIN "app"."course_sections" s ON s."id" = l."section_id"
        JOIN "app"."courses" c ON c."id" = l."course_id"
        WHERE l."is_published" AND c."status" = 'published'
          AND l."kind" IN ('video', 'quiz')
          ${courseFilter}
      ),
      /* The tail of each outline, per kind. */
      target AS (SELECT * FROM ranked WHERE rn <= ${query.window}),
      /* How many there actually ARE — a course with one published quiz must
         not be unreachable just because the window asks for two. */
      available AS (
        SELECT "course_id", "kind", count(*)::int AS n FROM target GROUP BY 1, 2
      ),
      missed AS (
        SELECT e."user_id", e."course_id", t."id" AS lesson_id, t."title", t."kind"
        FROM "app"."enrollments" e
        JOIN "app"."users" u ON u."id" = e."user_id" AND u."role" = 'student' AND u."banned_at" IS NULL
        JOIN "app"."student_profiles" pr ON pr."user_id" = e."user_id"
        JOIN target t ON t."course_id" = e."course_id"
        LEFT JOIN "app"."lesson_progress" lp
          ON lp."enrollment_id" = e."id" AND lp."lesson_id" = t."id"
        LEFT JOIN "app"."quizzes" q ON t."kind" = 'quiz' AND q."lesson_id" = t."id"
        WHERE ${ACTIVE_ENROLLMENT} ${yearFilter} ${userFilter}
          AND (
            /* A lecture counts as watched once the lesson reached a terminal
               state. completed covers a lesson with no quiz; passed and
               failed are written by grading, so both mean the video was
               watched and the paper was sat. */
            (t."kind" = 'video'
              AND (lp."state" IS NULL OR lp."state" NOT IN ('completed', 'passed', 'failed')))
            /* A quiz lesson with no quizzes row is a paper that was never
               built — nothing to chase, and naming it would send a student to
               an empty screen. */
            OR (t."kind" = 'quiz' AND q."id" IS NOT NULL AND NOT EXISTS (
                  SELECT 1 FROM "app"."quiz_attempts" qa
                  WHERE qa."quiz_id" = q."id" AND qa."user_id" = e."user_id"
                    AND qa."state" IN ('submitted', 'pending_review')
                ))
          )
      ),
      grouped AS (
        SELECT m."user_id", m."course_id",
               count(*) FILTER (WHERE m."kind" = 'video')::int AS n_lessons,
               count(*) FILTER (WHERE m."kind" = 'quiz')::int AS n_quizzes,
               jsonb_agg(jsonb_build_object('id', m.lesson_id, 'title', m."title"))
                 FILTER (WHERE m."kind" = 'video') AS missed_lessons,
               jsonb_agg(jsonb_build_object('id', m.lesson_id, 'title', m."title"))
                 FILTER (WHERE m."kind" = 'quiz') AS missed_quizzes
        FROM missed m
        GROUP BY 1, 2
      ),
      picked AS (
        SELECT g."user_id", pr."full_name" AS student_name, pr."phone",
               pr."year", pr."school_stream",
               g."course_id", c."title" AS course_title,
               g.missed_lessons, g.missed_quizzes,
               GREATEST(act.last_seen, act.last_attempt) AS last_active,
               msg.at AS last_messaged
        FROM grouped g
        JOIN "app"."courses" c ON c."id" = g."course_id"
        JOIN "app"."users" u ON u."id" = g."user_id"
        JOIN "app"."student_profiles" pr ON pr."user_id" = g."user_id"
        LEFT JOIN available av ON av."course_id" = g."course_id" AND av."kind" = 'video'
        LEFT JOIN available aq ON aq."course_id" = g."course_id" AND aq."kind" = 'quiz'
        LEFT JOIN LATERAL (
          /* Platform-wide, not course-scoped — see FollowUpRow.lastActiveAt. */
          SELECT (SELECT max(lp."last_heartbeat_at")
                  FROM "app"."lesson_progress" lp
                  JOIN "app"."enrollments" e2 ON e2."id" = lp."enrollment_id"
                  WHERE e2."user_id" = g."user_id") AS last_seen,
                 (SELECT max(qa."last_activity_at")
                  FROM "app"."quiz_attempts" qa
                  WHERE qa."user_id" = g."user_id") AS last_attempt
        ) act ON TRUE
        LEFT JOIN LATERAL (
          SELECT max(om."created_at") AS at
          FROM "app"."outreach_messages" om
          WHERE om."user_id" = g."user_id" AND om."kind" = 'follow_up'
        ) msg ON TRUE
        /* EVERY lesson in the window, for at least one of the two kinds. */
        WHERE (av.n IS NOT NULL AND g.n_lessons >= av.n)
           OR (aq.n IS NOT NULL AND g.n_quizzes >= aq.n)
      )`;
  }

  private toFollowUpRow(row: AtRiskRow): FollowUpRow {
    return {
      userId: row.user_id,
      studentName: row.student_name,
      phone: row.phone,
      year: row.year,
      schoolStream: row.school_stream,
      courseId: row.course_id,
      courseTitle: row.course_title,
      missedLessons: row.missed_lessons ?? [],
      missedQuizzes: row.missed_quizzes ?? [],
      lastActiveAt: row.last_active?.toISOString() ?? null,
      lastMessagedAt: row.last_messaged?.toISOString() ?? null,
    };
  }

  // ── «دخل المنصة ومشترَكش» ─────────────────────────────────────────────

  async idle(query: IdleQuery, take: number, skip: number): Promise<{ rows: IdleRow[]; rowCount: number }> {
    const selection = this.idleSelection(query, null);

    const [rows, counted] = await Promise.all([
      this.prisma.$queryRaw<IdleDbRow[]>(Prisma.sql`
        ${selection}
        SELECT * FROM picked_filtered
        /* Newest account first: somebody who signed up this week and stopped is
           still deciding, and that is the one this message can still catch. */
        ORDER BY created_at DESC, user_id ASC
        LIMIT ${take} OFFSET ${skip}
      `),
      this.prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
        ${selection}
        SELECT count(*)::bigint AS n FROM picked_filtered
      `),
    ]);

    return {
      rows: rows.map((row) => this.toIdleRow(row)),
      rowCount: Number(counted[0]?.n ?? 0),
    };
  }

  private idleSelection(query: IdleQuery, userId: string | null): Prisma.Sql {
    const yearFilter =
      query.year === undefined ? Prisma.empty : Prisma.sql`AND pr."year" = ${query.year}`;
    const userFilter = userId ? Prisma.sql`AND u."id" = ${userId}` : Prisma.empty;
    const reasonFilter =
      query.reason === undefined
        ? Prisma.empty
        : query.reason === 'never'
          ? Prisma.sql`AND enrolled = 0`
          : Prisma.sql`AND enrolled > 0`;

    return Prisma.sql`
      WITH picked AS (
        SELECT u."id" AS user_id,
               COALESCE(pr."full_name", u."name") AS student_name,
               COALESCE(pr."phone", u."phone_number") AS phone,
               (pr."user_id" IS NOT NULL) AS has_profile,
               pr."year", pr."school_stream",
               en.total AS enrolled,
               sug."id" AS suggested_id, sug."title" AS suggested_title, sug."slug" AS suggested_slug,
               u."created_at",
               msg.at AS last_messaged
        /*
         * Driven off users with the profile LEFT joined — unlike every other
         * roster in this codebase, where studentJoins() inner-joins it because
         * a student the admin cannot open is not a row worth printing.
         *
         * Here that rule would delete the answer. «دخل المنصة ومسجّلش في أي
         * كورس» is in large part the accounts that never finished onboarding
         * and so have no profile row at all; an inner join drops every one of
         * them and leaves a screen confidently reporting a much smaller
         * problem. They are listed, has_profile says the record will not open,
         * and the message they get is the catalog one.
         */
        FROM "app"."users" u
        LEFT JOIN "app"."student_profiles" pr ON pr."user_id" = u."id"
        LEFT JOIN LATERAL (
          /* One pass over the seats: how many there are, and how many are in a
             course this student's own year and stream point at. Two scans
             would be two chances to disagree about the second number. */
          SELECT count(*)::int AS total,
                 count(*) FILTER (WHERE ${COURSE_FITS_PROFILE})::int AS on_target
          FROM "app"."enrollments" e
          JOIN "app"."courses" c ON c."id" = e."course_id"
          WHERE e."user_id" = u."id" AND ${ACTIVE_ENROLLMENT}
        ) en ON TRUE
        LEFT JOIN LATERAL (
          SELECT c."id", c."title", c."slug"
          FROM "app"."courses" c
          WHERE ${COURSE_FITS_PROFILE}
          ORDER BY
            /* emphasis is a label and not a filter (see CourseEmphasis),
               which makes it exactly the right thing to RANK by here: it is
               the instructor's own answer to «ده مهم ليه ولا لأ», and this is
               the one place the platform has to pick one course for someone. */
            CASE c."emphasis"
              WHEN 'required' THEN 0 WHEN 'recommended' THEN 1 WHEN 'optional' THEN 2 ELSE 3
            END,
            (SELECT count(*) FROM "app"."lessons" l
             WHERE l."course_id" = c."id" AND l."is_published") DESC,
            c."created_at" ASC
          LIMIT 1
        ) sug ON TRUE
        LEFT JOIN LATERAL (
          SELECT max(om."created_at") AS at
          FROM "app"."outreach_messages" om
          WHERE om."user_id" = u."id" AND om."kind" = 'subscribe_nudge'
        ) msg ON TRUE
        WHERE u."role" = 'student' AND u."banned_at" IS NULL
          AND en.on_target = 0
          /* A student with a seat and no year on file is NOT «في الحتة الغلط»
             — the platform simply never asked. Listing them would tell someone
             who is studying happily that they subscribed to the wrong thing. */
          AND (en.total = 0 OR pr."year" IS NOT NULL)
          ${yearFilter} ${userFilter}
      )
      , picked_filtered AS (SELECT * FROM picked WHERE TRUE ${reasonFilter})`;
  }

  private toIdleRow(row: IdleDbRow): IdleRow {
    return {
      userId: row.user_id,
      studentName: row.student_name,
      phone: row.phone,
      hasProfile: row.has_profile,
      year: row.year,
      schoolStream: row.school_stream,
      reason: row.enrolled === 0 ? 'never' : 'elsewhere',
      enrolledCount: row.enrolled,
      suggestedCourseId: row.suggested_id,
      suggestedCourseTitle: row.suggested_title,
      suggestedCourseSlug: row.suggested_slug,
      createdAt: row.created_at.toISOString(),
      lastMessagedAt: row.last_messaged?.toISOString() ?? null,
    };
  }

  // ── sending ───────────────────────────────────────────────────────────

  /**
   * One named student, one course, one press.
   *
   * The facts are re-resolved from the database rather than taken from the
   * request: a browser that has had the table open for an hour would otherwise
   * be able to make the instructor write about a lecture the student watched
   * forty minutes ago. It also means there is exactly one definition of
   * «فاته إيه» in this file.
   *
   * Returns `false` when the student is no longer in the selection at all,
   * which the controller renders as «الطالب لحق نفسه» rather than as an error.
   */
  async sendFollowUp(
    userId: string,
    courseId: string,
    window: number,
  ): Promise<DeliveryOutcome | 'not-listed'> {
    /*
     * The SAME window the screen was showing, carried on the request.
     *
     * Not a constant, and not the maximum: a message that names five lectures
     * under a table that said two is the platform reporting something the
     * instructor never saw, and he is the one whose name is on it.
     */
    const rows = await this.prisma.$queryRaw<AtRiskRow[]>(Prisma.sql`
      ${this.atRiskSelection({ courseId, window }, userId)}
      SELECT * FROM picked LIMIT 1
    `);
    const row = rows[0];
    if (!row) return 'not-listed';

    const context = await this.outreach.context();
    return this.deliverFollowUp(this.toFollowUpRow(row), context);
  }

  async sendSubscribeNudge(userId: string): Promise<DeliveryOutcome | 'not-listed'> {
    const rows = await this.prisma.$queryRaw<IdleDbRow[]>(Prisma.sql`
      ${this.idleSelection({}, userId)}
      SELECT * FROM picked_filtered LIMIT 1
    `);
    const row = rows[0];
    if (!row) return 'not-listed';

    const context = await this.outreach.context();
    return this.deliverSubscribe(this.toIdleRow(row), context);
  }

  /**
   * «ابعت للكل» — the filter, re-resolved, capped, and cooled.
   *
   * Awaited to completion rather than fired and forgotten, unlike
   * `BroadcastService.send`: the cap keeps one press at two hundred sends,
   * which is seconds rather than the minutes a whole-cohort broadcast takes,
   * and the four numbers it returns are the entire point of the screen. A
   * result that said «جاري الإرسال» and nothing else would hide every skip.
   */
  async sendAllFollowUp(query: FollowUpQuery): Promise<OutreachSendResult> {
    const { rows } = await this.atRisk(query, OUTREACH_SEND_ALL_MAX, 0);
    const context = await this.outreach.context();
    const cooled = this.cooledOff(rows);

    const result = emptyResult();
    result.cooled = rows.length - cooled.length;
    for (const row of cooled) {
      tally(result, await this.deliverFollowUp(row, context));
    }
    this.logger.log(
      `follow-up sweep: ${result.sent} sent, ${result.duplicate} duplicate, ` +
        `${result.capped} capped, ${result.cooled} cooled`,
    );
    return result;
  }

  async sendAllSubscribe(query: IdleQuery): Promise<OutreachSendResult> {
    const { rows } = await this.idle(query, OUTREACH_SEND_ALL_MAX, 0);
    const context = await this.outreach.context();
    const cooled = this.cooledOff(rows);

    const result = emptyResult();
    result.cooled = rows.length - cooled.length;
    for (const row of cooled) {
      tally(result, await this.deliverSubscribe(row, context));
    }
    this.logger.log(
      `subscribe sweep: ${result.sent} sent, ${result.duplicate} duplicate, ` +
        `${result.capped} capped, ${result.cooled} cooled`,
    );
    return result;
  }

  /** Rows nobody has written to inside the cooldown. */
  private cooledOff<T extends { lastMessagedAt: string | null }>(rows: readonly T[]): T[] {
    const floor = Date.now() - FOLLOW_UP_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    return rows.filter((row) => row.lastMessagedAt === null || Date.parse(row.lastMessagedAt) < floor);
  }

  private deliverFollowUp(row: FollowUpRow, context: DeliveryContext): Promise<DeliveryOutcome> {
    const facts: OutreachFacts = {
      kind: 'follow_up',
      missedLessons: row.missedLessons.map((item) => item.title),
      missedQuizzes: row.missedQuizzes.map((item) => item.title),
    };
    return this.outreach.deliver(
      {
        userId: row.userId,
        kind: 'follow_up',
        /*
         * The exact set that was missed, not the course and not the date.
         *
         * A key of `courseId` alone would write once and never again, however
         * far behind the student fell afterwards. A key with a date in it
         * would write every day. This one changes exactly when the facts do —
         * so pressing «ابعت للكل» twice in a morning is a no-op, and the same
         * student appearing next week having ALSO missed the new lecture is a
         * new message about a new fact.
         */
        dedupeKey: dedupeKeyFor(row),
        facts,
      },
      context,
    );
  }

  private deliverSubscribe(row: IdleRow, context: DeliveryContext): Promise<DeliveryOutcome> {
    const facts: OutreachFacts = {
      kind: 'subscribe_nudge',
      courseTitle: row.suggestedCourseTitle,
      url: row.suggestedCourseSlug
        ? `${this.appUrl}/courses/${encodeURIComponent(row.suggestedCourseSlug)}`
        : `${this.appUrl}/courses`,
    };
    return this.outreach.deliver(
      {
        userId: row.userId,
        kind: 'subscribe_nudge',
        /*
         * The course we pointed at. A student whose year gets filled in later
         * — and whose suggestion therefore changes from the catalog to a real
         * course — is a genuinely different message and gets one.
         */
        dedupeKey: row.suggestedCourseId ?? 'catalog',
        facts,
      },
      context,
    );
  }
}

/** Stable across a retry, different the moment what was missed changes. */
function dedupeKeyFor(row: FollowUpRow): string {
  const ids = [...row.missedLessons, ...row.missedQuizzes].map((item) => item.id).sort();
  return `${row.courseId}:${ids.join(',')}`;
}

function emptyResult(): OutreachSendResult {
  return { sent: 0, duplicate: 0, capped: 0, cooled: 0 };
}

function tally(result: OutreachSendResult, outcome: DeliveryOutcome): void {
  if (outcome === 'sent') result.sent += 1;
  else if (outcome === 'duplicate') result.duplicate += 1;
  else if (outcome === 'capped') result.capped += 1;
  // `no-recipient` is a student deleted or banned between the read and the
  // write. Counted nowhere on purpose: it is not a skip the admin can act on.
}
