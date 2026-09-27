// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AdminFinanceDailySchema,
  AdminStudentPaymentsSchema,
} from '@ayman/contracts/admin/finance-daily';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { cairoDayKey } from '../analytics/analytics-shared';
import { FinanceDailyService, windowKeys } from './finance-daily.service';

/**
 * Against the real database, for the reason `finance.service.spec.ts` gives:
 * the whole job is reading real `payment_submissions` / `refunds` rows
 * correctly, and a mocked `$queryRaw` would only prove the mock agrees with
 * itself.
 *
 * `daily()` is platform-wide, and this database is shared with every other
 * spec. So every exact assertion is on THIS file's own two courses (their ids
 * are unique to the run), and the platform-wide figures are checked either as
 * invariants that hold whatever else is in the table, or as a before/after
 * delta.
 */
describe('FinanceDailyService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new FinanceDailyService(prisma);

  const DAY = 24 * 60 * 60 * 1000;
  const stamp = Date.now();
  const now = new Date();
  const [dayBefore, yesterday, today] = windowKeys(3, now) as [string, string, string];

  let adminId = '';
  let monthsCourseId = '';
  let planCourseId = '';
  let monthOne = '';
  let monthTwo = '';
  let studentA = '';
  let studentB = '';
  let studentC = '';
  let studentD = '';
  let refundedSubmission = '';
  let refundsTodayBefore = 0;

  /**
   * 00:20 in CAIRO on `key` — which is the PREVIOUS day in UTC (Cairo is two
   * or three hours ahead). A payment approved then belongs to `key`; bucketing
   * by the UTC date would put it on the day before, which is the exact bug
   * `cairoDay()` exists to prevent.
   */
  function cairoTwentyPastMidnight(key: string): Date {
    // Walk forward from four hours before UTC midnight in ten-minute steps
    // until the Cairo date turns over. Offsets are whole hours, so this lands
    // exactly on Cairo midnight whatever DST says today.
    let at = new Date(`${key}T00:00:00Z`).getTime() - 4 * 60 * 60 * 1000;
    while (cairoDayKey(new Date(at)) !== key) at += 10 * 60 * 1000;
    return new Date(at + 20 * 60 * 1000);
  }

  async function pay(data: {
    userId: string;
    courseId: string;
    at: Date;
    amountCents: number;
    plan?: 'monthly' | 'quarterly';
    months?: string[];
    isFree?: boolean;
    status?: 'approved' | 'rejected';
    senderPhone?: string | null;
  }): Promise<string> {
    const months = data.months ?? [];
    const row = await prisma.paymentSubmission.create({
      data: {
        userId: data.userId,
        courseId: data.courseId,
        plan: data.plan ?? 'monthly',
        amountCents: data.amountCents,
        isFree: data.isFree ?? false,
        status: data.status ?? 'approved',
        senderPhone: data.senderPhone === undefined ? '01000000000' : data.senderPhone,
        reviewedAt: data.at,
        createdAt: data.at,
        months:
          months.length > 0
            ? { createMany: { data: months.map((monthId) => ({ monthId, courseId: data.courseId })) } }
            : undefined,
      },
      select: { id: true },
    });
    return row.id;
  }

  beforeAll(async () => {
    await prisma.$connect();

    // Taken BEFORE this file writes its refund, so the assertion below is on
    // the delta — another spec on this database may have refunded today too.
    const before = await service.daily({ days: 7, includeBooks: false, now });
    refundsTodayBefore = before.daily.at(-1)!.refundCents;

    adminId = (
      await prisma.user.create({
        data: { id: `fd-admin-${stamp}`, name: 'أدمن', email: `fd-admin-${stamp}@t.test`, role: 'admin' },
      })
    ).id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();

    async function student(tag: string) {
      const id = `fd-${tag}-${stamp}`;
      await prisma.user.create({ data: { id, name: 'طالب', email: `${id}@t.test` } });
      return id;
    }
    studentA = await student('a');
    studentB = await student('b');
    studentC = await student('c');
    studentD = await student('d');

    const course = (slug: string, title: string, prices: Record<string, number>) =>
      prisma.course.create({
        data: {
          slug: `${slug}-${stamp}`,
          title,
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 1,
          forGeneral: true,
          forLanguages: false,
          instructorId: adminId,
          requiresGrant: true,
          ...prices,
        },
      });

    monthsCourseId = (await course('fd-months', 'كورس بالشهور', { monthlyPriceCents: 20000 })).id;
    planCourseId = (await course('fd-plan', 'كورس ٣ شهور', { quarterlyPriceCents: 50000 })).id;
    monthOne = (
      await prisma.courseMonth.create({ data: { courseId: monthsCourseId, monthIndex: 1, title: 'شهر ١' } })
    ).id;
    monthTwo = (
      await prisma.courseMonth.create({ data: { courseId: monthsCourseId, monthIndex: 2, title: 'شهر ٢' } })
    ).id;

    // A: «شهر ١» twenty days ago — OUTSIDE a 7-day window — then «شهر ٢» the
    // day before yesterday. The second is a renewal even though the first is
    // not on screen: history counts, not the window.
    await pay({ userId: studentA, courseId: monthsCourseId, at: new Date(now.getTime() - 20 * DAY), amountCents: 20000, months: [monthOne] });
    await pay({ userId: studentA, courseId: monthsCourseId, at: cairoTwentyPastMidnight(dayBefore), amountCents: 20000, months: [monthTwo], senderPhone: null });

    // B: «شهر ١ و٢» in ONE payment, at 00:20 Cairo yesterday — yesterday's
    // money, though the UTC date is the day before. Refunded in part TODAY.
    refundedSubmission = await pay({ userId: studentB, courseId: monthsCourseId, at: cairoTwentyPastMidnight(yesterday), amountCents: 40000, months: [monthOne, monthTwo] });
    await prisma.refund.create({
      data: {
        submissionId: refundedSubmission,
        amountCents: 10000,
        reasonAr: 'اختبار',
        occurredOn: new Date(`${today}T00:00:00Z`),
        createdBy: adminId,
      },
    });

    // C: comped first, THEN pays. The payment is NEW — a free trial is not a
    // subscription the student chose to pay for.
    await pay({ userId: studentC, courseId: monthsCourseId, at: new Date(now.getTime() - 5 * 60 * 1000), amountCents: 20000, months: [monthOne], isFree: true, senderPhone: null });
    await pay({ userId: studentC, courseId: monthsCourseId, at: new Date(now.getTime() - 60 * 1000), amountCents: 20000, months: [monthOne] });

    // D: a rolling plan on a course that does not sell by month, plus a
    // REJECTED claim the same minute, which must not count anywhere.
    await pay({ userId: studentD, courseId: planCourseId, at: new Date(now.getTime() - 60 * 1000), amountCents: 50000, plan: 'quarterly' });
    await pay({ userId: studentD, courseId: planCourseId, at: new Date(now.getTime() - 60 * 1000), amountCents: 50000, plan: 'quarterly', status: 'rejected' });
  });

  afterAll(async () => {
    const userIds = [studentA, studentB, studentC, studentD];
    // Refunds cascade with their submission.
    await prisma.paymentSubmission.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.course.deleteMany({ where: { id: { in: [monthsCourseId, planCourseId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...userIds, adminId] } } });
    await prisma.$disconnect();
  });

  it('buckets per Cairo day, splits new from renewal, and counts only what was paid', async () => {
    const report = AdminFinanceDailySchema.parse(
      await service.daily({ days: 7, includeBooks: false, now }),
    );

    expect(report.daily).toHaveLength(7);
    expect(report.to).toBe(today);
    expect(report.daily.map((day) => day.date)).toEqual(windowKeys(7, now));

    const cell = (date: string, courseId: string) =>
      report.daily.find((day) => day.date === date)?.byCourse.find((c) => c.courseId === courseId);

    // A's renewal, on the day before yesterday (Cairo), not the UTC day.
    expect(cell(dayBefore, monthsCourseId)).toMatchObject({ count: 1, newCount: 0, renewalCount: 1, amountCents: 20000 });
    // B's two-month payment is ONE subscription, on yesterday.
    expect(cell(yesterday, monthsCourseId)).toMatchObject({ count: 1, newCount: 1, renewalCount: 0, amountCents: 40000 });
    // C's paid one is today's; the comped one is not money.
    expect(cell(today, monthsCourseId)).toMatchObject({ count: 1, newCount: 1, renewalCount: 0, amountCents: 20000 });
    expect(cell(today, planCourseId)).toMatchObject({ count: 1, newCount: 1, amountCents: 50000 });

    const months = report.courses.find((c) => c.courseId === monthsCourseId)!;
    expect(months).toMatchObject({
      amountCents: 80000,
      count: 3,
      newCount: 2,
      renewalCount: 1,
      studentCount: 3,
      freeCount: 1,
    });
    // «شهر ١ و٢» counts under both months; A's «شهر ١» is outside the window.
    expect(months.items.map((item) => [item.label, item.count])).toEqual([
      ['شهر ١', 2],
      ['شهر ٢', 2],
    ]);

    const plan = report.courses.find((c) => c.courseId === planCourseId)!;
    expect(plan).toMatchObject({ amountCents: 50000, count: 1 });
    expect(plan.items).toEqual([
      { kind: 'plan', key: 'plan:quarterly', label: null, plan: 'quarterly', monthIndex: null, count: 1 },
    ]);
  });

  it('adds up — the days, the courses and the totals are one number', async () => {
    const report = await service.daily({ days: 30, includeBooks: false, now });
    const byDays = report.daily.reduce((sum, day) => sum + day.subscriptionCents, 0);
    const byCourses = report.courses.reduce((sum, course) => sum + course.amountCents, 0);
    expect(byDays).toBe(report.totals.subscriptionCents);
    expect(byCourses).toBe(report.totals.subscriptionCents);
    expect(report.totals.newCount + report.totals.renewalCount).toBe(report.totals.subscriptionCount);
    for (const day of report.daily) {
      expect(day.netCents).toBe(day.subscriptionCents + day.bookCents - day.refundCents);
    }
    // Asked without `book-order:read`: no book money, and it says so.
    expect(report.includesBooks).toBe(false);
    expect(report.totals.bookCents).toBe(0);
  });

  it('matches the finance predicate: approved, not comped, on the Cairo day it was approved', async () => {
    const report = await service.daily({ days: 30, includeBooks: false, now });
    const rows = await prisma.paymentSubmission.findMany({
      where: { status: 'approved', isFree: false, reviewedAt: { gte: new Date(now.getTime() - 32 * DAY) } },
      select: { amountCents: true, reviewedAt: true },
    });
    const expected = rows
      .filter((row) => row.reviewedAt && cairoDayKey(row.reviewedAt) >= report.from)
      .reduce((sum, row) => sum + row.amountCents, 0);
    expect(report.totals.subscriptionCents).toBe(expected);
  });

  it('lands a refund on the day it was given back, not the day of the sale', async () => {
    const report = await service.daily({ days: 7, includeBooks: false, now });
    expect(report.daily.at(-1)!.refundCents - refundsTodayBefore).toBe(10000);
  });

  it('lists one student’s payments newest first, each marked new, renewal or free', async () => {
    const a = AdminStudentPaymentsSchema.parse(await service.forStudent(studentA));
    expect(a.rows.map((row) => [row.kind, row.sequence, row.months.map((m) => m.title)])).toEqual([
      ['renewal', 2, ['شهر ٢']],
      ['new', 1, ['شهر ١']],
    ]);
    expect(a.rows[0]).toMatchObject({ paidOn: dayBefore, via: 'manual' });
    expect(a.rows[1]).toMatchObject({ via: 'review' });
    expect(a.totals).toMatchObject({ paidCents: 40000, paymentCount: 2, renewalCount: 1, courseCount: 1 });

    const b = await service.forStudent(studentB);
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0]).toMatchObject({ kind: 'new', refundedCents: 10000, paidOn: yesterday });
    expect(b.rows[0]!.months.map((m) => m.monthIndex)).toEqual([1, 2]);
    expect(b.totals).toMatchObject({ paidCents: 40000, refundedCents: 10000, netCents: 30000 });

    const c = await service.forStudent(studentC);
    expect(c.rows.map((row) => [row.kind, row.sequence])).toEqual([
      ['new', 1],
      ['free', null],
    ]);
    expect(c.totals).toMatchObject({ paidCents: 20000, freeCount: 1, paymentCount: 1 });

    // The rejected claim is not a subscription.
    const d = await service.forStudent(studentD);
    expect(d.rows).toHaveLength(1);
  });
});
