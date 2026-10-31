import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  SubscriberCourse,
  SubscriberHolding,
  SubscriberRow,
  SubscribersOverview,
  SubscribersQuery,
} from '@ayman/contracts/admin/subscribers';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

/**
 * «مين مشترك ومين لأ» — the counts and the lists behind `/admin/subscribers`.
 *
 * `@ayman/contracts/admin/subscribers`'s header says what «مشترك», «الشهر»
 * and `audience` mean; this file is the SQL that has to agree with it. Every
 * number on the screen and every row in the list are built from the same
 * three fragments below, so a count and the list it links to cannot describe
 * two different sets.
 *
 * Single statements, not a fetch-and-filter in Node: the list is paginated,
 * and filtering a page that was already cut gives page one of the wrong
 * answer (`FollowUpService` says the same about its selection).
 */

/**
 * The courses this report is about: paid, and not the foundation one.
 *
 * `courseId` narrows it to one, which is also how the list's course filter
 * works — every fragment downstream reads `rc`, so narrowing here narrows
 * everything at once and no second `WHERE course_id = …` can be forgotten.
 */
function reportedCourses(courseId: string | undefined): Prisma.Sql {
  const one = courseId === undefined ? Prisma.empty : Prisma.sql`AND c."id" = ${courseId}::uuid`;
  return Prisma.sql`
    rc AS (
      SELECT c."id", c."title", c."year", c."status", c."cover_key", c."created_at",
             c."for_general", c."for_languages", c."track_id", sj."name_ar" AS subject_name_ar
      FROM "app"."courses" c
      LEFT JOIN "app"."subjects" sj ON sj."id" = c."subject_id"
      WHERE c."requires_grant"
        /* «سيبك من التأسيس» — the same name match quiz/challenges.ts makes. */
        AND c."title" !~ 'تأسيس' AND coalesce(c."subtitle", '') !~ 'تأسيس'
        ${one}
    )`;
}

/**
 * Every student account that is not banned, with the profile LEFT joined.
 *
 * Unlike `studentJoins()`, a missing profile does not drop the row: an
 * account that signed up and never onboarded still left its phone on
 * `users.phone_number`, and «اللي في المنصة ومشتركوش» — the ads list this
 * screen was asked for — is in large part exactly those accounts.
 * `FollowUpService.idleSelection` makes the same call for the same reason.
 */
function students(year: number | undefined, q: string): Prisma.Sql {
  const yearFilter = year === undefined ? Prisma.empty : Prisma.sql`AND pr."year" = ${year}`;
  const digits = q.replace(/\D/g, '');
  const search =
    q === ''
      ? Prisma.empty
      : Prisma.sql`AND (
          COALESCE(pr."full_name", u."name") ILIKE ${`%${q}%`}
          ${digits.length >= 4 ? Prisma.sql`OR COALESCE(pr."phone", u."phone_number") LIKE ${`%${digits}%`}` : Prisma.empty}
        )`;
  return Prisma.sql`
    stu AS (
      SELECT u."id", u."created_at",
             COALESCE(pr."full_name", u."name") AS name,
             COALESCE(pr."phone", u."phone_number") AS phone,
             pr."father_phone", pr."mother_phone",
             (pr."user_id" IS NOT NULL) AS has_profile,
             pr."year", pr."school_stream", pr."track_id"
      FROM "app"."users" u
      LEFT JOIN "app"."student_profiles" pr ON pr."user_id" = u."id"
      WHERE u."role" = 'student' AND u."banned_at" IS NULL
        ${yearFilter} ${search}
    )`;
}

/**
 * Every paid grant a listed student holds on a reported course, live or not,
 * with `live` computed once.
 *
 * The scope list is `CourseHeadcountService`'s, `course_month` included — see
 * `scope-lists-predate-course-month` for what leaving it out did to that
 * screen. `live` is `grantLiveness() === 'live'` in SQL: not revoked, started,
 * and an open-ended or future `valid_until`.
 */
function paidGrants(now: Date): Prisma.Sql {
  return Prisma.sql`
    pg AS (
      SELECT g."user_id", g."course_id", g."scope", g."month_id",
             (g."revoked_at" IS NULL AND g."valid_from" <= ${now}
              AND (g."valid_until" IS NULL OR g."valid_until" > ${now})) AS live
      FROM "app"."access_grants" g
      JOIN stu ON stu."id" = g."user_id"
      WHERE g."scope" IN ('course', 'term', 'course_month')
        AND g."course_id" IN (SELECT "id" FROM rc)
    )`;
}

/**
 * Does student `s` belong to course `k`'s year and stream?
 *
 * `FollowUpService`'s `COURSE_FITS_PROFILE`, minus the `published` clause
 * (an unpublished course with subscribers still has an audience). A null
 * year fits nothing — see the contract's header for why that is a refusal to
 * guess rather than an omission.
 */
function fits(s: string, k: string): Prisma.Sql {
  const S = Prisma.raw(s);
  const K = Prisma.raw(k);
  return Prisma.sql`(
    ${S}."year" IS NOT NULL AND ${K}."year" = ${S}."year"
    AND (
      ${S}."school_stream" IS NULL
      OR (${S}."school_stream" = 'general' AND ${K}."for_general")
      OR (${S}."school_stream" = 'languages' AND ${K}."for_languages")
    )
    AND (${K}."track_id" IS NULL OR ${S}."track_id" IS NULL OR ${K}."track_id" = ${S}."track_id")
  )`;
}

interface CourseDbRow {
  id: string;
  title: string;
  year: number;
  cover_key: string | null;
  subject_name_ar: string | null;
  subscribed: number;
  audience: number;
  ever: number;
  months: {
    id: string;
    month_index: number;
    title: string;
    is_open: boolean;
    subscribed: number;
    bought: number;
  }[];
}

interface TotalsDbRow {
  students: number;
  subscribed: number;
  lapsed: number;
  with_phone: number;
}

interface ListDbRow {
  id: string;
  name: string;
  phone: string | null;
  father_phone: string | null;
  mother_phone: string | null;
  has_profile: boolean;
  year: number | null;
  created_at: Date;
  ever: boolean;
}

interface HoldingDbRow {
  user_id: string;
  course_id: string;
  title: string;
  scope: 'course' | 'term' | 'course_month';
  month_index: number | null;
}

/** A row plus the parents' numbers — only the export reads those. */
export type SubscriberExportRow = SubscriberRow & {
  fatherPhone: string | null;
  motherPhone: string | null;
};

@Injectable()
export class SubscribersService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<SubscribersOverview> {
    const now = new Date();
    const base = Prisma.sql`WITH ${reportedCourses(undefined)}, ${students(undefined, '')}, ${paidGrants(now)}`;

    const [courses, totalsRows] = await Promise.all([
      this.prisma.$queryRaw<CourseDbRow[]>(Prisma.sql`
        ${base},
        ever AS (SELECT DISTINCT "course_id", "user_id" FROM pg),
        live AS (SELECT DISTINCT "course_id", "user_id" FROM pg WHERE live),
        aud AS (
          SELECT rc."id" AS course_id, stu."id" AS user_id FROM rc JOIN stu ON ${fits('stu', 'rc')}
          UNION
          SELECT "course_id", "user_id" FROM ever
        )
        SELECT rc."id", rc."title", rc."year", rc."cover_key", rc."subject_name_ar",
          (SELECT count(*) FROM live WHERE live."course_id" = rc."id")::int AS subscribed,
          (SELECT count(*) FROM aud WHERE aud."course_id" = rc."id")::int AS audience,
          (SELECT count(*) FROM ever WHERE ever."course_id" = rc."id")::int AS ever,
          COALESCE((
            SELECT json_agg(json_build_object(
              'id', m."id", 'month_index', m."month_index", 'title', m."title", 'is_open', m."is_open",
              /* Covered: bought this month, or holds anything wider on the
                 course — monthSliceOf's rule, see the contract. */
              'subscribed', (SELECT count(DISTINCT pg."user_id") FROM pg
                             WHERE pg."course_id" = m."course_id" AND pg.live
                               AND (pg."scope" <> 'course_month' OR pg."month_id" = m."id")),
              'bought', (SELECT count(DISTINCT pg."user_id") FROM pg
                         WHERE pg.live AND pg."month_id" = m."id")
            ) ORDER BY m."month_index")
            FROM "app"."course_months" m WHERE m."course_id" = rc."id"
          ), '[]'::json) AS months
        FROM rc
        /* An unpublished course still shows while anybody ever paid for it —
           going back to draft does not empty it. */
        WHERE rc."status" = 'published' OR EXISTS (SELECT 1 FROM ever WHERE ever."course_id" = rc."id")
        ORDER BY rc."year" ASC, rc."created_at" ASC
      `),
      this.prisma.$queryRaw<TotalsDbRow[]>(Prisma.sql`
        ${base},
        live_u AS (SELECT DISTINCT "user_id" FROM pg WHERE live),
        ever_u AS (SELECT DISTINCT "user_id" FROM pg)
        SELECT
          (SELECT count(*) FROM stu)::int AS students,
          (SELECT count(*) FROM live_u)::int AS subscribed,
          (SELECT count(*) FROM ever_u WHERE "user_id" NOT IN (SELECT "user_id" FROM live_u))::int AS lapsed,
          (SELECT count(*) FROM stu WHERE stu."phone" IS NOT NULL
             AND stu."id" NOT IN (SELECT "user_id" FROM live_u))::int AS with_phone
      `),
    ]);

    const totals = totalsRows[0] ?? { students: 0, subscribed: 0, lapsed: 0, with_phone: 0 };
    return {
      totals: {
        students: totals.students,
        subscribed: totals.subscribed,
        notSubscribed: totals.students - totals.subscribed,
        lapsed: totals.lapsed,
        withPhone: totals.with_phone,
      },
      courses: courses.map(toCourse),
    };
  }

  async list(
    query: SubscribersQuery,
    take: number,
    skip: number,
  ): Promise<{ rows: SubscriberRow[]; rowCount: number }> {
    const { rows, rowCount } = await this.select(query, take, skip);
    return { rows: rows.map(({ fatherPhone: _f, motherPhone: _m, ...row }) => row), rowCount };
  }

  /** The whole selection, unpaginated, parents' numbers included. */
  async exportRows(query: SubscribersQuery, max: number): Promise<SubscriberExportRow[]> {
    return (await this.select(query, max, 0)).rows;
  }

  /** Course titles for the screen's file names and headings. `null` when the id is not a reported course. */
  async courseTitle(courseId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<{ title: string }[]>(Prisma.sql`
      WITH ${reportedCourses(courseId)} SELECT "title" FROM rc`);
    return rows[0]?.title ?? null;
  }

  private async select(
    query: SubscribersQuery,
    take: number,
    skip: number,
  ): Promise<{ rows: SubscriberExportRow[]; rowCount: number }> {
    const now = new Date();
    const course = query.courseId;

    if (course !== undefined && (await this.courseTitle(course)) === null) {
      // Not a paid course, or the foundation one — there is nothing to be
      // subscribed to, and an empty list would read as «كلهم مشتركين».
      throw new BadRequestException('not a reported course');
    }
    if (query.monthId !== undefined) {
      // A month of ANOTHER course would match no month grant here and quietly
      // list only the wide holders as «مشتركين في الشهر».
      const month = await this.prisma.courseMonth.findFirst({
        where: { id: query.monthId, courseId: course },
        select: { id: true },
      });
      if (!month) throw new BadRequestException('month is not in this course');
    }

    /* Who is covered: any live grant on the reported course(s), narrowed to
       the month when one is picked — a wide grant covers every month. */
    const covers =
      query.monthId === undefined
        ? Prisma.empty
        : Prisma.sql`AND (pg."scope" <> 'course_month' OR pg."month_id" = ${query.monthId}::uuid)`;

    let membership: Prisma.Sql;
    if (query.status === 'in') {
      membership = Prisma.sql`stu."id" IN (SELECT "user_id" FROM live_u)`;
    } else if (query.audience === 'past') {
      membership = Prisma.sql`stu."id" NOT IN (SELECT "user_id" FROM live_u)
        AND stu."id" IN (SELECT "user_id" FROM ever_u)`;
    } else if (course !== undefined) {
      membership = Prisma.sql`stu."id" NOT IN (SELECT "user_id" FROM live_u)
        AND (EXISTS (SELECT 1 FROM rc WHERE ${fits('stu', 'rc')})
             OR stu."id" IN (SELECT "user_id" FROM ever_u))`;
    } else {
      membership = Prisma.sql`stu."id" NOT IN (SELECT "user_id" FROM live_u)`;
    }
    const phoneFilter = query.withPhone ? Prisma.sql`AND stu."phone" IS NOT NULL` : Prisma.empty;

    const selection = Prisma.sql`
      WITH ${reportedCourses(course)}, ${students(query.year, query.q)}, ${paidGrants(now)},
      live_u AS (SELECT DISTINCT "user_id" FROM pg WHERE live ${covers}),
      ever_u AS (SELECT DISTINCT "user_id" FROM pg),
      picked AS (
        SELECT stu.*, (stu."id" IN (SELECT "user_id" FROM ever_u)) AS ever
        FROM stu WHERE ${membership} ${phoneFilter}
      )`;

    const [rows, counted] = await Promise.all([
      this.prisma.$queryRaw<ListDbRow[]>(Prisma.sql`
        ${selection}
        SELECT * FROM picked
        ORDER BY "created_at" DESC, "id" DESC
        LIMIT ${take} OFFSET ${skip}
      `),
      this.prisma.$queryRaw<{ n: number }[]>(Prisma.sql`${selection} SELECT count(*)::int AS n FROM picked`),
    ]);

    const holdings = await this.holdings(
      rows.map((row) => row.id),
      course,
      now,
    );

    return {
      rowCount: counted[0]?.n ?? 0,
      rows: rows.map((row) => ({
        userId: row.id,
        name: row.name,
        phone: row.phone,
        hasProfile: row.has_profile,
        year: row.year,
        holdings: holdings.get(row.id) ?? [],
        everSubscribed: row.ever,
        createdAt: row.created_at.toISOString(),
        fatherPhone: row.father_phone,
        motherPhone: row.mother_phone,
      })),
    };
  }

  /** What each listed student holds right now, grouped per course. One query for the page. */
  private async holdings(
    userIds: readonly string[],
    courseId: string | undefined,
    now: Date,
  ): Promise<Map<string, SubscriberHolding[]>> {
    const byUser = new Map<string, SubscriberHolding[]>();
    if (userIds.length === 0) return byUser;

    const rows = await this.prisma.$queryRaw<HoldingDbRow[]>(Prisma.sql`
      WITH ${reportedCourses(courseId)}
      SELECT g."user_id", g."course_id", rc."title", g."scope", m."month_index"
      FROM "app"."access_grants" g
      JOIN rc ON rc."id" = g."course_id"
      LEFT JOIN "app"."course_months" m ON m."id" = g."month_id"
      WHERE g."user_id" = ANY(${userIds as string[]}::text[])
        AND g."scope" IN ('course', 'term', 'course_month')
        AND g."revoked_at" IS NULL AND g."valid_from" <= ${now}
        AND (g."valid_until" IS NULL OR g."valid_until" > ${now})
      ORDER BY rc."year", rc."created_at"
    `);

    for (const row of rows) {
      const list = byUser.get(row.user_id) ?? [];
      let holding = list.find((h) => h.courseId === row.course_id);
      if (!holding) {
        holding = { courseId: row.course_id, title: row.title, wide: false, monthIndexes: [] };
        list.push(holding);
        byUser.set(row.user_id, list);
      }
      if (row.scope !== 'course_month') holding.wide = true;
      else if (row.month_index !== null && !holding.monthIndexes.includes(row.month_index)) {
        holding.monthIndexes.push(row.month_index);
      }
    }
    for (const list of byUser.values()) {
      for (const holding of list) holding.monthIndexes.sort((a, b) => a - b);
    }
    return byUser;
  }
}

function toCourse(row: CourseDbRow): SubscriberCourse {
  return {
    courseId: row.id,
    title: row.title,
    year: row.year,
    coverKey: row.cover_key,
    subjectNameAr: row.subject_name_ar ?? '',
    subscribed: row.subscribed,
    audience: row.audience,
    notSubscribed: Math.max(0, row.audience - row.subscribed),
    lapsed: Math.max(0, row.ever - row.subscribed),
    months: row.months.map((month) => ({
      monthId: month.id,
      monthIndex: month.month_index,
      title: month.title,
      isOpen: month.is_open,
      subscribed: month.subscribed,
      boughtMonth: month.bought,
      // Both differences are exact, not estimates: every covered student
      // holds a grant on the course, so they are inside `ever` and `aud`.
      notSubscribed: Math.max(0, row.audience - month.subscribed),
      droppedOut: Math.max(0, row.ever - month.subscribed),
    })),
  };
}
