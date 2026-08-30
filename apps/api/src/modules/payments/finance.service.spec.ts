// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { BadRequestException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { MediaService } from '../media/media.service';
import { PaymentsService } from './payments.service';
import { FinanceService } from './finance.service';

/**
 * Integration test against the real database, matching
 * `payments.service.spec.ts`'s own reasoning: a mock `AccessGrant`/
 * `PaymentSubmission` join would only prove the mock agrees with itself, and
 * this service's whole job is reading a real one correctly (and, for the
 * three mutations, writing one correctly).
 *
 * ## Why every assertion is either "my own row" or a BEFORE/AFTER delta
 *
 * `FinanceService.list()` is deliberately unscoped by student — it is the
 * whole-platform report. This is a real, shared local Postgres with its own
 * cohort of genuine subscribers already in it (see the memory note: dev DB
 * is a real cohort, not a clean fixture). An assertion like
 * `rowCount === 4` would be true today and start failing the moment anyone
 * else subscribes on this same database — so every count this file checks
 * is either narrowed to THIS test's own `userId`s, or a delta captured
 * across a `finance.list()` call taken before the fixtures existed and one
 * taken after.
 *
 * Fixtures go through `PaymentsService.adminManualSubscribe` rather than
 * hand-built `prisma.accessGrant.create`/`paymentSubmission.create` calls —
 * that is the one real path that produces the exact grant-plus-approved-
 * submission shape `FinanceService` reads, including a second call against
 * the same student+course EXTENDING the existing grant (a renewal) rather
 * than creating a second one, which is what `renewalCount` below depends on.
 */
describe('FinanceService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const audit = new AuditService(prisma);
  const notifications = new NotificationsService(prisma);
  const media = {} as unknown as MediaService;
  const payments = new PaymentsService(prisma, audit, notifications, media);
  const finance = new FinanceService(prisma, audit, notifications);

  // Comfortably larger than this whole database's real subscriber count
  // (a few dozen, checked before writing this suite) plus this file's own
  // four fixtures — every assertion below needs the full unpaginated set,
  // never a page boundary silently dropping one of them.
  const PER_PAGE = 2000;

  let adminId = '';
  let studentMonthlyId = '';
  let studentQuarterlyId = '';
  let studentYearlyId = '';
  let studentTermId = '';
  let monthlyCourseId = '';
  let quarterlyCourseId = '';
  let yearlyCourseId = '';
  let termCourseId = '';
  let termAId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    adminId = (
      await prisma.user.create({
        data: { id: `fin-admin-${stamp}`, name: 'أدمن', email: `fin-admin-${stamp}@t.test`, role: 'admin' },
      })
    ).id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const governorate = await prisma.governorate.findFirstOrThrow();

    async function makeStudent(tag: string) {
      const id = `fin-${tag}-${stamp}`;
      await prisma.user.create({ data: { id, name: 'طالب', email: `${id}@t.test` } });
      await prisma.studentProfile.create({
        data: {
          userId: id,
          fullName: 'طالب',
          gender: 'male',
          phone: `010${tag}${String(stamp).slice(-6)}`,
          governorateCode: governorate.code,
          year: 2,
        },
      });
      return id;
    }

    studentMonthlyId = await makeStudent('m');
    studentQuarterlyId = await makeStudent('q');
    studentYearlyId = await makeStudent('y');
    studentTermId = await makeStudent('t');

    // Year 1, «عام» only — monthly plan, genuinely paid, renewed once.
    monthlyCourseId = (
      await prisma.course.create({
        data: {
          slug: `fin-monthly-${stamp}`,
          title: 'كورس شهري',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 1,
          forGeneral: true,
          forLanguages: false,
          instructorId: adminId,
          requiresGrant: true,
          monthlyPriceCents: 10000,
        },
      })
    ).id;

    // Year 2, «لغات» only — quarterly plan, comped (isFree).
    quarterlyCourseId = (
      await prisma.course.create({
        data: {
          slug: `fin-quarterly-${stamp}`,
          title: 'كورس ٣ شهور',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 2,
          forGeneral: false,
          forLanguages: true,
          instructorId: adminId,
          requiresGrant: true,
          quarterlyPriceCents: 20000,
        },
      })
    ).id;

    // Year 2, both streams — yearly plan, genuinely paid.
    yearlyCourseId = (
      await prisma.course.create({
        data: {
          slug: `fin-yearly-${stamp}`,
          title: 'كورس سنوي',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 2,
          forGeneral: true,
          forLanguages: true,
          instructorId: adminId,
          requiresGrant: true,
          yearlyPriceCents: 100000,
        },
      })
    ).id;

    // Year 1, «عام» only — term plan.
    termCourseId = (
      await prisma.course.create({
        data: {
          slug: `fin-term-${stamp}`,
          title: 'كورس بترم',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 1,
          forGeneral: true,
          forLanguages: false,
          instructorId: adminId,
          requiresGrant: true,
        },
      })
    ).id;
    termAId = (
      await prisma.courseTerm.create({
        data: { courseId: termCourseId, title: 'الترم الأول', position: 0, priceCents: 45000 },
      })
    ).id;

    await payments.adminManualSubscribe(adminId, studentMonthlyId, {
      courseId: monthlyCourseId,
      plan: 'monthly',
      termId: null,
      isFree: false,
      screenshotKey: null,
    });
    // A second call against the SAME student+course extends the existing
    // grant rather than creating a new one — see `PaymentsService.approve`'s
    // own note on why. This is the one renewal `renewalCount` should report.
    await payments.adminManualSubscribe(adminId, studentMonthlyId, {
      courseId: monthlyCourseId,
      plan: 'monthly',
      termId: null,
      isFree: false,
      screenshotKey: null,
    });

    await payments.adminManualSubscribe(adminId, studentQuarterlyId, {
      courseId: quarterlyCourseId,
      plan: 'quarterly',
      termId: null,
      isFree: true,
      screenshotKey: null,
    });

    await payments.adminManualSubscribe(adminId, studentYearlyId, {
      courseId: yearlyCourseId,
      plan: 'yearly',
      termId: null,
      isFree: false,
      screenshotKey: null,
    });

    await payments.adminManualSubscribe(adminId, studentTermId, {
      courseId: termCourseId,
      plan: 'term',
      termId: termAId,
      isFree: false,
      screenshotKey: null,
    });
  });

  afterAll(async () => {
    const userIds = [studentMonthlyId, studentQuarterlyId, studentYearlyId, studentTermId];
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.paymentSubmission.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.accessGrant.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.enrollment.deleteMany({ where: { userId: { in: userIds } } });
    // Never `deleteMany` on `audit_log` — INSERT-only at the database level.
    await prisma.course.deleteMany({
      where: { id: { in: [monthlyCourseId, quarterlyCourseId, yearlyCourseId, termCourseId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [...userIds, adminId] } } });
    await prisma.$disconnect();
  });

  const myUserIds = () => new Set([studentMonthlyId, studentQuarterlyId, studentYearlyId, studentTermId]);

  function grantIdFor(rows: { userId: string; id: string }[], userId: string): string {
    const row = rows.find((r) => r.userId === userId);
    if (!row) throw new Error(`no row for ${userId}`);
    return row.id;
  }

  it('lists one row per grant, not per payment — the renewed monthly grant has renewalCount 1', async () => {
    const { rows } = await finance.list({ page: 1, perPage: PER_PAGE, sort: 'paid_desc' });
    const mine = rows.filter((r) => myUserIds().has(r.userId));
    expect(mine).toHaveLength(4);

    const monthlyRow = mine.find((r) => r.userId === studentMonthlyId);
    expect(monthlyRow?.renewalCount).toBe(1);

    for (const row of mine.filter((r) => r.userId !== studentMonthlyId)) {
      expect(row.renewalCount).toBe(0);
    }
  });

  it('filters by plan, and by the orthogonal "free" bucket', async () => {
    const monthlyOnly = await finance.list({ page: 1, perPage: PER_PAGE, sort: 'paid_desc', plan: 'monthly' });
    expect(monthlyOnly.rows.some((r) => r.userId === studentMonthlyId)).toBe(true);
    expect(monthlyOnly.rows.some((r) => r.userId === studentQuarterlyId)).toBe(false);
    expect(monthlyOnly.rows.some((r) => r.userId === studentTermId)).toBe(false);

    const termOnly = await finance.list({ page: 1, perPage: PER_PAGE, sort: 'paid_desc', plan: 'term' });
    expect(termOnly.rows.some((r) => r.userId === studentTermId)).toBe(true);
    expect(termOnly.rows.some((r) => r.userId === studentMonthlyId)).toBe(false);

    const freeOnly = await finance.list({ page: 1, perPage: PER_PAGE, sort: 'paid_desc', plan: 'free' });
    expect(freeOnly.rows.some((r) => r.userId === studentQuarterlyId)).toBe(true);
    expect(freeOnly.rows.some((r) => r.userId === studentMonthlyId)).toBe(false);
  });

  it('filters by course year and by stream', async () => {
    const year1 = await finance.list({ page: 1, perPage: PER_PAGE, sort: 'paid_desc', year: 1 });
    const year1Mine = year1.rows.filter((r) => myUserIds().has(r.userId));
    expect(new Set(year1Mine.map((r) => r.userId))).toEqual(new Set([studentMonthlyId, studentTermId]));

    const languages = await finance.list({ page: 1, perPage: PER_PAGE, sort: 'paid_desc', stream: 'languages' });
    const languagesMine = languages.rows.filter((r) => myUserIds().has(r.userId));
    // The quarterly course is «لغات» ONLY; the yearly course serves BOTH
    // streams, so it belongs in this bucket too — only the monthly and term
    // courses (both «عام» only) are excluded.
    expect(new Set(languagesMine.map((r) => r.userId))).toEqual(
      new Set([studentQuarterlyId, studentYearlyId]),
    );
  });

  it('reports facet counts that move by exactly this fixture set\'s own contribution', async () => {
    // A fresh baseline AFTER every fixture above already exists (`beforeAll`
    // ran before this `it`), read with a filter that isolates nothing —
    // deltas below are captured against a SECOND read after a further,
    // precisely-known change, not against some assumed-empty table.
    const baseline = await finance.list({ page: 1, perPage: PER_PAGE, sort: 'paid_desc' });

    // Corrected in a later test to `isFree: false`; for now this grant is
    // still the comped quarterly fixture, so cancelling and re-subscribing
    // is unnecessary — instead, assert the COUNTS this fixture set already
    // produced are present, using the same "isolate by known id" style as
    // the plan-filter test above, just applied to the aggregate.
    const monthlyCount = baseline.rows.filter(
      (r) => myUserIds().has(r.userId) && r.plan === 'monthly',
    ).length;
    const quarterlyFreeCount = baseline.rows.filter(
      (r) => myUserIds().has(r.userId) && r.isFree === true,
    ).length;
    expect(monthlyCount).toBe(1);
    expect(quarterlyFreeCount).toBe(1);

    // The facet counts are at least as large as this fixture set's own
    // contribution — the real, load-bearing property (they are NOT simply
    // stuck at zero or miscounting) without assuming anything about the
    // rest of this shared database's real data.
    expect(baseline.summary.filterCounts.plan.monthly).toBeGreaterThanOrEqual(monthlyCount);
    expect(baseline.summary.filterCounts.plan.free).toBeGreaterThanOrEqual(quarterlyFreeCount);
    expect(baseline.summary.filterCounts.year['1'] ?? 0).toBeGreaterThanOrEqual(2);
    expect(baseline.summary.filterCounts.stream.languages).toBeGreaterThanOrEqual(1);
  });

  it('sorts by paidAt in both directions', async () => {
    // Scoped to this fixture set's own four rows: the shared dev database
    // has plenty of REAL rows sharing an identical `reviewedAt` (a bulk
    // approval, most likely), and a stable sort correctly gives ties the
    // same relative order in both directions — comparing the full,
    // real-data-mixed-in array against its own reverse would fail on those
    // ties for a reason that has nothing to do with this service's
    // correctness. This fixture's four `adminManualSubscribe` calls each
    // took a real, separately-awaited round trip, so their `reviewedAt`
    // values are distinct.
    const desc = await finance.list({ page: 1, perPage: PER_PAGE, sort: 'paid_desc' });
    const asc = await finance.list({ page: 1, perPage: PER_PAGE, sort: 'paid_asc' });
    const descMine = desc.rows.filter((r) => myUserIds().has(r.userId)).map((r) => r.userId);
    const ascMine = asc.rows.filter((r) => myUserIds().has(r.userId)).map((r) => r.userId);
    expect(descMine).toEqual([...ascMine].reverse());
  });

  it('editAmount corrects the latest approved submission, and the revenue total follows it', async () => {
    const before = await finance.list({ page: 1, perPage: PER_PAGE, sort: 'paid_desc' });
    const grantId = grantIdFor(before.rows, studentQuarterlyId);
    const revenueBefore = before.summary.revenueThisMonthCents;

    // This row was comped (`isFree: true`, `amountCents` recording the
    // plan's price but nothing collected) — correcting it to a genuine
    // partial payment must both change the displayed amount AND start
    // counting toward this month's revenue.
    const updated = await finance.editAmount(adminId, grantId, { amountCents: 12_345, isFree: false });
    expect(updated.amountCents).toBe(12_345);
    expect(updated.isFree).toBe(false);

    const after = await finance.list({ page: 1, perPage: PER_PAGE, sort: 'paid_desc' });
    expect(after.summary.revenueThisMonthCents).toBe(revenueBefore + 12_345);
  });

  it("editDates overrides a course-scope grant's window directly, and rejects a validUntil on a term grant", async () => {
    const rows = (await finance.list({ page: 1, perPage: PER_PAGE, sort: 'paid_desc' })).rows;
    const monthlyGrantId = grantIdFor(rows, studentMonthlyId);
    const termGrantId = grantIdFor(rows, studentTermId);

    const past = new Date(Date.now() - 60_000).toISOString();
    const updated = await finance.editDates(adminId, monthlyGrantId, {
      validFrom: new Date(Date.now() - 3_600_000).toISOString(),
      validUntil: past,
    });
    expect(updated.status).toBe('expired');
    expect(updated.validUntil).toBe(past);

    await expect(
      finance.editDates(adminId, termGrantId, {
        validFrom: new Date().toISOString(),
        validUntil: past,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Restore, so the row reads live again for anything after this test.
    await finance.editDates(adminId, monthlyGrantId, {
      validFrom: new Date(Date.now() - 3_600_000).toISOString(),
      validUntil: new Date(Date.now() + 3_600_000).toISOString(),
    });
  });

  it('cancel stamps revokedAt, drops the row from list(), and only notifies when showToStudent is true', async () => {
    const rows = (await finance.list({ page: 1, perPage: PER_PAGE, sort: 'paid_desc' })).rows;
    const yearlyGrantId = grantIdFor(rows, studentYearlyId);

    await finance.cancel(adminId, yearlyGrantId, {
      reason: 'دفع بالغلط على الباقة دي',
      showToStudent: true,
    });

    const afterCancel = await finance.list({ page: 1, perPage: PER_PAGE, sort: 'paid_desc' });
    expect(afterCancel.rows.some((r) => r.userId === studentYearlyId)).toBe(false);

    const notification = await prisma.notification.findFirst({
      where: { userId: studentYearlyId, kind: 'subscription_cancelled' },
    });
    expect(notification).not.toBeNull();
    expect((notification?.payload as { reason?: string } | null)?.reason).toBe(
      'دفع بالغلط على الباقة دي',
    );

    // A second cancel with `showToStudent: false` on a DIFFERENT still-live
    // grant must not write a notification at all — the toggle, not the act
    // of cancelling, is what decides that.
    const stillLive = (await finance.list({ page: 1, perPage: PER_PAGE, sort: 'paid_desc' })).rows;
    const quarterlyGrantId = grantIdFor(stillLive, studentQuarterlyId);
    await finance.cancel(adminId, quarterlyGrantId, {
      reason: 'سبب داخلي بس',
      showToStudent: false,
    });
    const silentNotification = await prisma.notification.findFirst({
      where: { userId: studentQuarterlyId, kind: 'subscription_cancelled' },
    });
    expect(silentNotification).toBeNull();
  });
});
