import { Injectable } from '@nestjs/common';
import type {
  AdminFinanceDaily,
  AdminStudentPayments,
  FinanceDailyCourse,
  FinanceDailyItem,
  FinanceDay,
  FinanceDayCourse,
  StudentPaymentRow,
  StudentPaymentVia,
} from '@ayman/contracts/admin/finance-daily';
import type { PaymentPlan } from '@ayman/contracts/payments';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { cairoDay, cairoDayKey } from '../analytics/analytics-shared';
import { BOOK_REVENUE_SQL } from '../book-orders/book-revenue';

/** Safe for the reason `FinanceOverviewService` spells out: a module constant
 *  with no interpolation, never anything off a request. */
const BOOK_REVENUE_RAW = Prisma.raw(BOOK_REVENUE_SQL);

/** The instant a submission became money. `reviewed_at` is what every other
 *  money screen buckets on; `created_at` only covers an approved row that
 *  somehow carries no review stamp, so it is never silently dropped. */
const PAID_AT = 'coalesce(s."reviewed_at", s."created_at")';

/**
 * «جديد» ولا «تجديد» — THE definition, in one place, for both endpoints.
 *
 * Every approved, PAID submission is numbered within its (student, course)
 * pair, oldest first. Number 1 is the student's first paid subscription to
 * that course — NEW. Anything after it is a RENEWAL: the student paid for this
 * course before and paid for it again («شهر ٢» after «شهر ١», a second term,
 * a rolling plan bought again).
 *
 * Three choices, each deliberate:
 *
 * - **Over all time, then filtered.** The numbering runs over the whole
 *   table and the window is applied afterwards, so a student who paid in
 *   June and again yesterday is a renewal yesterday even on the 7-day view.
 * - **Paid only.** A comped (`is_free`) row is not numbered: a free trial
 *   followed by the first real payment makes that payment NEW, because it is
 *   the first time the student chose to pay.
 * - **Per course, not per student.** Buying a second course is a new
 *   subscription to it, not a renewal of the first.
 *
 * `id` breaks ties so two payments approved in the same millisecond still
 * number deterministically (uuid7 ids are chronological).
 */
function paidRank(scope: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    paid_rank AS (
      SELECT s."id",
             row_number() OVER (
               PARTITION BY s."user_id", s."course_id"
               ORDER BY ${Prisma.raw(PAID_AT)}, s."id"
             )::int AS nth
      FROM "app"."payment_submissions" s
      WHERE s."status" = 'approved' AND s."is_free" = false ${scope}
    )`;
}

interface SubmissionRow {
  id: string;
  user_id: string;
  course_id: string;
  course_title: string;
  amount_cents: number;
  is_free: boolean;
  plan: PaymentPlan;
  term_id: string | null;
  term_title: string | null;
  day: string;
  nth: number | null;
}

interface BookDayRow {
  day: string;
  cents: bigint | number | null;
  n: number;
}

interface RefundDayRow {
  day: string;
  sub: bigint | number | null;
  book: bigint | number | null;
}

interface StudentRow {
  id: string;
  course_id: string;
  course_title: string;
  plan: PaymentPlan;
  term_title: string | null;
  amount_cents: number;
  is_free: boolean;
  paid_at: string;
  day: string;
  nth: number | null;
  sender_phone: string | null;
  instapay: boolean;
  refunded: bigint | number | null;
}

/** `SUM` arrives as `bigint` through the driver; piastres fit a double many
 *  times over, but the narrowing has to be explicit or JSON throws on it. */
function toNumber(value: bigint | number | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

/** `YYYY-MM-DD` ± whole calendar days, stepped on UTC midnights so a DST
 *  change in Cairo can never make a day 23 or 25 hours long here. */
function shiftDay(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The window's Cairo days, oldest first, ending today. */
export function windowKeys(days: number, now: Date): string[] {
  const today = cairoDayKey(now);
  return Array.from({ length: days }, (_, index) => shiftDay(today, index - (days - 1)));
}

const PLAN_ORDER: Record<PaymentPlan, number> = { monthly: 0, quarterly: 1, yearly: 2, term: 3 };

function emptyDay(date: string): FinanceDay {
  return {
    date,
    subscriptionCents: 0,
    bookCents: 0,
    refundCents: 0,
    netCents: 0,
    subscriptionCount: 0,
    newCount: 0,
    renewalCount: 0,
    freeCount: 0,
    bookCount: 0,
    byCourse: [],
  };
}

/**
 * «الفلوس يوم بيوم» and the payments timeline on a student's page.
 *
 * Its own service rather than more of `FinanceService`: that one owns the
 * grant mutations and its spec pins the delegates it may touch. This one only
 * reads, and it reads PAYMENTS (one row per `PaymentSubmission`), where
 * `FinanceService` reads SUBSCRIPTIONS (one row per grant). Both use the same
 * money predicate — `status = approved AND is_free = false` — and the same
 * date, `reviewed_at`, as `FinanceOverviewService.monthly`, so this screen's
 * thirty days add up to that screen's figures for the same thirty days.
 *
 * Nothing here reads `access_grants`. A hand-issued grant is not income, and a
 * cancelled one is not a refund — only a `Refund` row takes money out, on the
 * day it was given back.
 */
@Injectable()
export class FinanceDailyService {
  constructor(private readonly prisma: PrismaService) {}

  async daily(options: {
    days: number;
    includeBooks: boolean;
    now?: Date;
  }): Promise<AdminFinanceDaily> {
    const now = options.now ?? new Date();
    const keys = windowKeys(options.days, now);
    const from = keys[0]!;
    const to = keys[keys.length - 1]!;
    /*
     * A cheap, indexable lower bound for the timestamp scans: UTC midnight of
     * the first Cairo day, minus a day. Cairo is never more than three hours
     * ahead of UTC, so this always includes the window's first minute; the
     * exact cut is the `cairoDay(...) >= from` beside it.
     */
    const lowerBound = new Date(`${shiftDay(from, -1)}T00:00:00Z`);

    const [submissions, books, refunds] = await Promise.all([
      this.prisma.$queryRaw<SubmissionRow[]>(Prisma.sql`
        WITH ${paidRank(Prisma.empty)}
        SELECT s."id", s."user_id", s."course_id", c."title" AS course_title,
               s."amount_cents", s."is_free", s."plan"::text AS plan,
               s."term_id", t."title" AS term_title,
               ${cairoDay(PAID_AT)} AS day,
               pr."nth"
        FROM "app"."payment_submissions" s
        JOIN "app"."courses" c ON c."id" = s."course_id"
        LEFT JOIN "app"."course_terms" t ON t."id" = s."term_id"
        LEFT JOIN paid_rank pr ON pr."id" = s."id"
        WHERE s."status" = 'approved'
          AND ${Prisma.raw(PAID_AT)} >= ${lowerBound}
          AND ${cairoDay(PAID_AT)} >= ${from}
      `),
      options.includeBooks
        ? this.prisma.$queryRaw<BookDayRow[]>(Prisma.sql`
            SELECT ${cairoDay('o."paid_at"')} AS day,
                   COALESCE(SUM(o."amount_cents"), 0) AS cents,
                   COUNT(*)::int AS n
            FROM "app"."book_orders" o
            WHERE ${BOOK_REVENUE_RAW}
              AND o."paid_at" >= ${lowerBound}
              AND ${cairoDay('o."paid_at"')} >= ${from}
            GROUP BY 1
          `)
        : Promise.resolve([] as BookDayRow[]),
      /*
       * `occurred_on` is already a calendar DATE — the day the money went
       * back — so it is read as it is, with no time zone to convert. A refund
       * of a sale from before the window still lands in the window when it
       * happened inside it; that is the whole point of dating it separately.
       */
      this.prisma.$queryRaw<RefundDayRow[]>(Prisma.sql`
        SELECT to_char(r."occurred_on", 'YYYY-MM-DD') AS day,
               COALESCE(SUM(r."amount_cents") FILTER (WHERE r."submission_id" IS NOT NULL), 0) AS sub,
               COALESCE(SUM(r."amount_cents") FILTER (WHERE r."book_order_id" IS NOT NULL), 0) AS book
        FROM "app"."refunds" r
        WHERE r."occurred_on" >= ${from}::date
        GROUP BY 1
      `),
    ]);

    const monthsBySubmission = await this.monthsFor(
      submissions.filter((row) => !row.is_free).map((row) => row.id),
    );

    const byDay = new Map(keys.map((key) => [key, emptyDay(key)]));
    const dayCourse = new Map<string, Map<string, FinanceDayCourse>>();

    interface CourseAcc {
      course: FinanceDailyCourse;
      students: Set<string>;
      items: Map<string, FinanceDailyItem>;
    }
    const courses = new Map<string, CourseAcc>();
    const paying = new Set<string>();
    const renewing = new Set<string>();

    const courseFor = (row: SubmissionRow): CourseAcc => {
      let acc = courses.get(row.course_id);
      if (!acc) {
        acc = {
          course: {
            courseId: row.course_id,
            courseTitle: row.course_title,
            amountCents: 0,
            count: 0,
            newCount: 0,
            renewalCount: 0,
            studentCount: 0,
            freeCount: 0,
            items: [],
          },
          students: new Set(),
          items: new Map(),
        };
        courses.set(row.course_id, acc);
      }
      return acc;
    };

    const bumpItem = (acc: CourseAcc, item: Omit<FinanceDailyItem, 'count'>) => {
      const existing = acc.items.get(item.key);
      if (existing) existing.count += 1;
      else acc.items.set(item.key, { ...item, count: 1 });
    };

    for (const row of submissions) {
      const day = byDay.get(row.day);
      // Outside the window (a stamp later than "today" in Cairo, say). Never
      // happens in practice; dropped rather than growing a key the axis lacks.
      if (!day) continue;
      const acc = courseFor(row);

      if (row.is_free) {
        day.freeCount += 1;
        acc.course.freeCount += 1;
        continue;
      }

      const renewal = (row.nth ?? 1) > 1;
      day.subscriptionCents += row.amount_cents;
      day.subscriptionCount += 1;
      if (renewal) day.renewalCount += 1;
      else day.newCount += 1;

      const cells = dayCourse.get(row.day) ?? new Map<string, FinanceDayCourse>();
      dayCourse.set(row.day, cells);
      const cell = cells.get(row.course_id) ?? {
        courseId: row.course_id,
        count: 0,
        newCount: 0,
        renewalCount: 0,
        amountCents: 0,
      };
      cell.count += 1;
      cell.amountCents += row.amount_cents;
      if (renewal) cell.renewalCount += 1;
      else cell.newCount += 1;
      cells.set(row.course_id, cell);

      acc.course.amountCents += row.amount_cents;
      acc.course.count += 1;
      if (renewal) acc.course.renewalCount += 1;
      else acc.course.newCount += 1;
      acc.students.add(row.user_id);

      paying.add(row.user_id);
      if (renewal) renewing.add(row.user_id);

      // What was bought. A month purchase names its months; a term names its
      // term; anything else is one of the rolling plans.
      const months = monthsBySubmission.get(row.id) ?? [];
      if (months.length > 0) {
        for (const month of months) {
          bumpItem(acc, {
            kind: 'month',
            key: month.id,
            label: month.title,
            plan: null,
            monthIndex: month.monthIndex,
          });
        }
      } else if (row.plan === 'term') {
        bumpItem(acc, {
          kind: 'term',
          key: row.term_id ?? 'term:unknown',
          label: row.term_title,
          plan: 'term',
          monthIndex: null,
        });
      } else {
        bumpItem(acc, {
          kind: 'plan',
          key: `plan:${row.plan}`,
          label: null,
          plan: row.plan,
          monthIndex: null,
        });
      }
    }

    for (const row of books) {
      const day = byDay.get(row.day);
      if (!day) continue;
      day.bookCents += toNumber(row.cents);
      day.bookCount += row.n;
    }

    for (const row of refunds) {
      const day = byDay.get(row.day);
      if (!day) continue;
      day.refundCents += toNumber(row.sub) + (options.includeBooks ? toNumber(row.book) : 0);
    }

    const daily = keys.map((key) => {
      const day = byDay.get(key)!;
      day.netCents = day.subscriptionCents + day.bookCents - day.refundCents;
      day.byCourse = [...(dayCourse.get(key)?.values() ?? [])].sort(
        (a, b) => b.amountCents - a.amountCents || b.count - a.count,
      );
      return day;
    });

    const courseList = [...courses.values()]
      .map(({ course, students, items }) => ({
        ...course,
        studentCount: students.size,
        items: [...items.values()].sort(
          (a, b) =>
            (a.monthIndex ?? 99) - (b.monthIndex ?? 99) ||
            (a.plan ? PLAN_ORDER[a.plan] : 9) - (b.plan ? PLAN_ORDER[b.plan] : 9) ||
            (a.label ?? '').localeCompare(b.label ?? '', 'ar'),
        ),
      }))
      .sort(
        (a, b) =>
          b.amountCents - a.amountCents ||
          b.count - a.count ||
          a.courseTitle.localeCompare(b.courseTitle, 'ar'),
      );

    const sum = (pick: (day: FinanceDay) => number) =>
      daily.reduce((total, day) => total + pick(day), 0);

    return {
      days: options.days,
      from,
      to,
      includesBooks: options.includeBooks,
      totals: {
        subscriptionCents: sum((d) => d.subscriptionCents),
        bookCents: sum((d) => d.bookCents),
        refundCents: sum((d) => d.refundCents),
        netCents: sum((d) => d.netCents),
        subscriptionCount: sum((d) => d.subscriptionCount),
        newCount: sum((d) => d.newCount),
        renewalCount: sum((d) => d.renewalCount),
        renewingStudents: renewing.size,
        payingStudents: paying.size,
        freeCount: sum((d) => d.freeCount),
        bookCount: sum((d) => d.bookCount),
      },
      courses: courseList,
      daily,
    };
  }

  /**
   * Every approved subscription payment one student ever made, newest first,
   * each marked new / renewal / free by the same `paidRank` the daily screen
   * uses — so «تجديد» means the same thing on both pages.
   */
  async forStudent(userId: string): Promise<AdminStudentPayments> {
    const rows = await this.prisma.$queryRaw<StudentRow[]>(Prisma.sql`
      WITH ${paidRank(Prisma.sql`AND s."user_id" = ${userId}`)}
      SELECT s."id", s."course_id", c."title" AS course_title, s."plan"::text AS plan,
             t."title" AS term_title, s."amount_cents", s."is_free",
             to_char(${Prisma.raw(PAID_AT)}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS paid_at,
             ${cairoDay(PAID_AT)} AS day,
             pr."nth",
             s."sender_phone",
             EXISTS (
               SELECT 1 FROM "app"."incoming_transfers" it
               WHERE it."matched_submission_id" = s."id"
             ) AS instapay,
             (SELECT COALESCE(SUM(r."amount_cents"), 0)
                FROM "app"."refunds" r WHERE r."submission_id" = s."id") AS refunded
      FROM "app"."payment_submissions" s
      JOIN "app"."courses" c ON c."id" = s."course_id"
      LEFT JOIN "app"."course_terms" t ON t."id" = s."term_id"
      LEFT JOIN paid_rank pr ON pr."id" = s."id"
      WHERE s."user_id" = ${userId} AND s."status" = 'approved'
      ORDER BY ${Prisma.raw(PAID_AT)} DESC, s."id" DESC
    `);

    const months = await this.monthsFor(rows.map((row) => row.id));

    const payments: StudentPaymentRow[] = rows.map((row) => {
      const via: StudentPaymentVia = row.instapay
        ? 'instapay'
        : row.sender_phone === null
          ? 'manual'
          : 'review';
      return {
        submissionId: row.id,
        courseId: row.course_id,
        courseTitle: row.course_title,
        plan: row.plan,
        termTitle: row.term_title,
        months: (months.get(row.id) ?? []).map((month) => ({
          monthIndex: month.monthIndex,
          title: month.title,
        })),
        amountCents: row.amount_cents,
        isFree: row.is_free,
        kind: row.is_free ? 'free' : (row.nth ?? 1) > 1 ? 'renewal' : 'new',
        sequence: row.is_free ? null : (row.nth ?? 1),
        paidAt: row.paid_at,
        paidOn: row.day,
        refundedCents: toNumber(row.refunded),
        via,
      };
    });

    const paid = payments.filter((row) => !row.isFree);
    const paidCents = paid.reduce((total, row) => total + row.amountCents, 0);
    const refundedCents = payments.reduce((total, row) => total + row.refundedCents, 0);

    return {
      totals: {
        paidCents,
        refundedCents,
        netCents: paidCents - refundedCents,
        paymentCount: paid.length,
        renewalCount: paid.filter((row) => row.kind === 'renewal').length,
        freeCount: payments.length - paid.length,
        courseCount: new Set(payments.map((row) => row.courseId)).size,
      },
      rows: payments,
    };
  }

  /** The curriculum months each payment bought, lowest first. One query with
   *  an `in`, never one per row. */
  private async monthsFor(
    submissionIds: readonly string[],
  ): Promise<Map<string, { id: string; monthIndex: number; title: string }[]>> {
    const bySubmission = new Map<string, { id: string; monthIndex: number; title: string }[]>();
    if (submissionIds.length === 0) return bySubmission;

    const rows = await this.prisma.paymentSubmissionMonth.findMany({
      where: { submissionId: { in: [...submissionIds] } },
      select: {
        submissionId: true,
        month: { select: { id: true, monthIndex: true, title: true } },
      },
      orderBy: { month: { monthIndex: 'asc' } },
    });

    for (const row of rows) {
      const list = bySubmission.get(row.submissionId) ?? [];
      list.push(row.month);
      bySubmission.set(row.submissionId, list);
    }
    return bySubmission;
  }
}
