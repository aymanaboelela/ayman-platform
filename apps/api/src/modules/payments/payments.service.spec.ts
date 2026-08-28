// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { MediaService } from '../media/media.service';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const audit = new AuditService(prisma);
  const notifications = new NotificationsService(prisma);
  // `uploadScreenshot`/`screenshotKeyFor` are the only methods that reach
  // `MediaService`, and neither is exercised below — `submit` only checks
  // the KEY's prefix string, never the storage behind it. A real
  // `MediaService` needs `FileSignatureService` and a storage backend wired
  // up, which nothing here is testing.
  const media = {} as unknown as MediaService;
  const service = new PaymentsService(prisma, audit, notifications, media);

  let adminId = '';
  let studentId = '';
  let strangerId = '';
  let monthlyOnlyCourseId = '';
  let bothPlansCourseId = '';
  let yearlyOnlyCourseId = '';
  let termCourseId = '';
  let termAId = '';
  let closedTermId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    adminId = (
      await prisma.user.create({
        data: { id: `pay-admin-${stamp}`, name: 'أدمن', email: `pay-admin-${stamp}@t.test`, role: 'admin' },
      })
    ).id;
    studentId = (
      await prisma.user.create({
        data: { id: `pay-student-${stamp}`, name: 'طالب', email: `pay-student-${stamp}@t.test` },
      })
    ).id;
    strangerId = (
      await prisma.user.create({
        data: { id: `pay-stranger-${stamp}`, name: 'غريب', email: `pay-stranger-${stamp}@t.test` },
      })
    ).id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const governorate = await prisma.governorate.findFirstOrThrow();

    // `adminManualSubscribe` looks up `studentProfile` the same way
    // `AdminStudentsService.grantCourse` does — a real student page always
    // has one, so the fixture needs one too.
    await prisma.studentProfile.create({
      data: {
        userId: studentId,
        fullName: 'طالب',
        gender: 'male',
        phone: `0100${String(stamp).slice(-7)}`,
        governorateCode: governorate.code,
        year: 2,
      },
    });

    monthlyOnlyCourseId = (
      await prisma.course.create({
        data: {
          slug: `pay-monthly-${stamp}`,
          title: 'كورس شهري بس',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 2,
          instructorId: adminId,
          requiresGrant: true,
          monthlyPriceCents: 15000,
        },
      })
    ).id;

    bothPlansCourseId = (
      await prisma.course.create({
        data: {
          slug: `pay-both-${stamp}`,
          title: 'كورس بالباقتين',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 3,
          instructorId: adminId,
          requiresGrant: true,
          monthlyPriceCents: 15000,
          quarterlyPriceCents: 30000,
        },
      })
    ).id;

    yearlyOnlyCourseId = (
      await prisma.course.create({
        data: {
          slug: `pay-yearly-${stamp}`,
          title: 'كورس سنوي بس',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 2,
          instructorId: adminId,
          requiresGrant: true,
          yearlyPriceCents: 120000,
        },
      })
    ).id;

    termCourseId = (
      await prisma.course.create({
        data: {
          slug: `pay-terms-${stamp}`,
          title: 'كورس بترمين',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 2,
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
    closedTermId = (
      await prisma.courseTerm.create({
        data: {
          courseId: termCourseId,
          title: 'الترم الثاني',
          position: 1,
          priceCents: 45000,
          isOpen: false,
        },
      })
    ).id;
  });

  beforeEach(async () => {
    await prisma.paymentSubmission.deleteMany({ where: { userId: { in: [studentId, strangerId] } } });
    await prisma.accessGrant.deleteMany({ where: { userId: { in: [studentId, strangerId] } } });
    await prisma.enrollment.deleteMany({ where: { userId: { in: [studentId, strangerId] } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [studentId, strangerId] } } });
  });

  afterAll(async () => {
    await prisma.paymentSubmission.deleteMany({ where: { userId: { in: [studentId, strangerId] } } });
    await prisma.accessGrant.deleteMany({ where: { userId: { in: [studentId, strangerId] } } });
    await prisma.enrollment.deleteMany({ where: { userId: { in: [studentId, strangerId] } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [studentId, strangerId] } } });
    // Never `deleteMany` on `audit_log` — it is INSERT-only at the database
    // level (see the model's own note), and a local role that happens to
    // permit it just hides the 42501 CI would raise on the same call.
    await prisma.course.deleteMany({
      where: { id: { in: [monthlyOnlyCourseId, bothPlansCourseId, yearlyOnlyCourseId, termCourseId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, strangerId, adminId] } } });
    await prisma.$disconnect();
  });

  const validScreenshotKey = () => `payment-proof/${randomUUID()}.webp`;

  describe('submit', () => {
    it('creates a pending submission for a plan the course sells', async () => {
      const result = await service.submit(studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });

      expect(result.status).toBe('pending');
      expect(result.validUntil).toBeNull();
      expect(result.courseId).toBe(monthlyOnlyCourseId);

      const row = await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: result.id } });
      expect(row.userId).toBe(studentId);
      // Derived from the course's own monthly price, never from caller
      // input — there is no `amountCents` in the request above at all.
      expect(row.amountCents).toBe(15000);
      expect(row.senderPhone).toBe('01012345678');
      expect(result.senderPhone).toBe('01012345678');
    });

    it('rejects a screenshotKey not issued by the upload step', async () => {
      await expect(
        service.submit(studentId, {
          courseId: monthlyOnlyCourseId,
          plan: 'monthly',
          senderPhone: '01012345678',
          screenshotKey: 'course-cover/not-a-payment-proof.webp',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s an unknown course', async () => {
      await expect(
        service.submit(studentId, {
          courseId: randomUUID(),
          plan: 'monthly',
          senderPhone: '01012345678',
          screenshotKey: validScreenshotKey(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a plan the course does not sell', async () => {
      await expect(
        service.submit(studentId, {
          courseId: monthlyOnlyCourseId,
          plan: 'quarterly',
          senderPhone: '01012345678',
          screenshotKey: validScreenshotKey(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a second pending submission for the same course', async () => {
      await service.submit(studentId, {
        courseId: bothPlansCourseId,
        plan: 'monthly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });

      await expect(
        service.submit(studentId, {
          courseId: bothPlansCourseId,
          plan: 'quarterly',
          senderPhone: '01012345678',
          screenshotKey: validScreenshotKey(),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows a fresh submission once the earlier one was reviewed', async () => {
      const first = await service.submit(studentId, {
        courseId: bothPlansCourseId,
        plan: 'monthly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      await service.reject(adminId, first.id, { reason: 'not clear' });

      const second = await service.submit(studentId, {
        courseId: bothPlansCourseId,
        plan: 'quarterly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      expect(second.status).toBe('pending');
    });
  });

  describe('submit — term plan', () => {
    it('creates a pending submission priced from the TERM, not the course', async () => {
      const result = await service.submit(studentId, {
        courseId: termCourseId,
        plan: 'term',
        termId: termAId,
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });

      expect(result.status).toBe('pending');
      expect(result.termId).toBe(termAId);
      expect(result.termTitle).toBe('الترم الأول');

      const row = await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: result.id } });
      expect(row.amountCents).toBe(45000);
      expect(row.termId).toBe(termAId);
    });

    it('refuses a CLOSED term — the student-facing flow only sells open ones', async () => {
      await expect(
        service.submit(studentId, {
          courseId: termCourseId,
          plan: 'term',
          termId: closedTermId,
          senderPhone: '01012345678',
          screenshotKey: validScreenshotKey(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses a termId that belongs to a DIFFERENT course", async () => {
      await expect(
        service.submit(studentId, {
          courseId: bothPlansCourseId,
          plan: 'term',
          termId: termAId,
          senderPhone: '01012345678',
          screenshotKey: validScreenshotKey(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('approve', () => {
    it('creates a purchase grant, activates enrollment, and notifies the student', async () => {
      const submission = await service.submit(studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });

      const before = new Date();
      const result = await service.approve(adminId, submission.id);

      const grant = await prisma.accessGrant.findFirstOrThrow({
        where: { userId: studentId, courseId: monthlyOnlyCourseId, scope: 'course', source: 'purchase' },
      });
      expect(grant.validUntil).not.toBeNull();
      expect(grant.validUntil!.getTime()).toBeGreaterThan(before.getTime());
      expect(result.validUntil).toBe(grant.validUntil!.toISOString());

      const enrollment = await prisma.enrollment.findUniqueOrThrow({
        where: { userId_courseId: { userId: studentId, courseId: monthlyOnlyCourseId } },
      });
      expect(enrollment.status).toBe('active');
      expect(enrollment.source).toBe('purchase');

      const updated = await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: submission.id } });
      expect(updated.status).toBe('approved');
      expect(updated.grantId).toBe(grant.id);
      expect(updated.reviewedByUserId).toBe(adminId);

      const notification = await prisma.notification.findFirstOrThrow({
        where: { userId: studentId, kind: 'payment_approved' },
      });
      expect((notification.payload as Record<string, unknown>).courseId).toBe(monthlyOnlyCourseId);
    });

    it('extends the existing grant on renewal rather than stacking a second one', async () => {
      const first = await service.submit(studentId, {
        courseId: bothPlansCourseId,
        plan: 'monthly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      const firstResult = await service.approve(adminId, first.id);

      const second = await service.submit(studentId, {
        courseId: bothPlansCourseId,
        plan: 'quarterly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      // The quarterly plan's own price, not the monthly one the first
      // submission on this same course derived.
      expect(second.amountCents).toBe(30000);
      const secondResult = await service.approve(adminId, second.id);

      const grants = await prisma.accessGrant.findMany({
        where: { userId: studentId, courseId: bothPlansCourseId, scope: 'course', source: 'purchase' },
      });
      expect(grants).toHaveLength(1);
      expect(new Date(secondResult.validUntil).getTime()).toBeGreaterThan(
        new Date(firstResult.validUntil).getTime(),
      );
    });

    it('refuses to review the same submission twice', async () => {
      const submission = await service.submit(studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      await service.approve(adminId, submission.id);

      await expect(service.approve(adminId, submission.id)).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s an unknown submission', async () => {
      await expect(service.approve(adminId, randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates a date-based `scope: course` grant for the yearly plan — NOT the open-ended `scope: term` treatment', async () => {
      const submission = await service.submit(studentId, {
        courseId: yearlyOnlyCourseId,
        plan: 'yearly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });

      const before = new Date();
      const result = await service.approve(adminId, submission.id);

      // A real calendar expiry, same as monthly/quarterly — never null the
      // way a `scope: term` grant's `validUntil` always is.
      expect(result.validUntil).not.toBeNull();
      const validUntil = new Date(result.validUntil as string);
      expect(validUntil.getTime()).toBeGreaterThan(before.getTime());
      // Roughly 12 months out (allowing for month-length variance) — proves
      // this actually ran the 12-month math, not just "some future date".
      const roughlyElevenMonthsOut = new Date(before);
      roughlyElevenMonthsOut.setUTCMonth(roughlyElevenMonthsOut.getUTCMonth() + 11);
      expect(validUntil.getTime()).toBeGreaterThan(roughlyElevenMonthsOut.getTime());

      const grant = await prisma.accessGrant.findFirstOrThrow({
        where: { userId: studentId, courseId: yearlyOnlyCourseId, source: 'purchase' },
      });
      // `scope: course`, not `scope: term` — a yearly grant is a whole-course
      // grant with a real expiry, not the term machinery's open-ended one.
      expect(grant.scope).toBe('course');
      expect(grant.termId).toBeNull();
      expect(grant.validUntil).not.toBeNull();

      const submissionRow = await prisma.paymentSubmission.findUniqueOrThrow({
        where: { id: submission.id },
      });
      expect(submissionRow.plan).toBe('yearly');
      expect(submissionRow.termId).toBeNull();
    });
  });

  describe('approve — term plan', () => {
    it('creates an open-ended `scope: term` grant — validUntil stays null', async () => {
      const submission = await service.submit(studentId, {
        courseId: termCourseId,
        plan: 'term',
        termId: termAId,
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });

      const result = await service.approve(adminId, submission.id);
      expect(result.validUntil).toBeNull();

      const grant = await prisma.accessGrant.findFirstOrThrow({
        where: { userId: studentId, courseId: termCourseId, termId: termAId, scope: 'term', source: 'purchase' },
      });
      expect(grant.validUntil).toBeNull();
      expect(grant.revokedAt).toBeNull();

      const enrollment = await prisma.enrollment.findUniqueOrThrow({
        where: { userId_courseId: { userId: studentId, courseId: termCourseId } },
      });
      expect(enrollment.status).toBe('active');

      // The notification still fires, with a null validUntil — see the
      // `PaymentApprovedNotificationSchema` note on why this is not required.
      const notification = await prisma.notification.findFirstOrThrow({
        where: { userId: studentId, kind: 'payment_approved' },
      });
      expect((notification.payload as Record<string, unknown>).validUntil).toBeNull();
    });

    it('reuses a still-live grant for the SAME term rather than stacking a second one', async () => {
      const first = await service.submit(studentId, {
        courseId: termCourseId,
        plan: 'term',
        termId: termAId,
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      await service.approve(adminId, first.id);

      const second = await service.submit(studentId, {
        courseId: termCourseId,
        plan: 'term',
        termId: termAId,
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      await service.approve(adminId, second.id);

      const grants = await prisma.accessGrant.findMany({
        where: { userId: studentId, courseId: termCourseId, termId: termAId, scope: 'term', source: 'purchase' },
      });
      expect(grants).toHaveLength(1);
    });
  });

  describe('reject', () => {
    it('records the reason and notifies the student, without creating a grant', async () => {
      const submission = await service.submit(studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });

      await service.reject(adminId, submission.id, { reason: 'المبلغ في الصورة مش مطابق' });

      const updated = await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: submission.id } });
      expect(updated.status).toBe('rejected');
      expect(updated.rejectionReason).toBe('المبلغ في الصورة مش مطابق');
      expect(updated.grantId).toBeNull();

      const grant = await prisma.accessGrant.findFirst({
        where: { userId: studentId, courseId: monthlyOnlyCourseId, source: 'purchase' },
      });
      expect(grant).toBeNull();

      const notification = await prisma.notification.findFirstOrThrow({
        where: { userId: studentId, kind: 'payment_rejected' },
      });
      expect((notification.payload as Record<string, unknown>).reason).toBe('المبلغ في الصورة مش مطابق');
    });

    it('refuses to review the same submission twice', async () => {
      const submission = await service.submit(studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      await service.reject(adminId, submission.id, { reason: 'x' });

      await expect(service.reject(adminId, submission.id, { reason: 'y' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('listMine', () => {
    it("returns only the caller's own submissions, newest first", async () => {
      const mine1 = await service.submit(studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      await service.reject(adminId, mine1.id, { reason: 'no' });
      const mine2 = await service.submit(studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });

      await service.submit(strangerId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });

      const mine = await service.listMine(studentId);
      expect(mine.map((row) => row.id)).toEqual([mine2.id, mine1.id]);
      expect(mine.every((row) => row.courseId === monthlyOnlyCourseId)).toBe(true);
    });
  });

  describe('adminList', () => {
    it('filters by status and counts prior approvals per student', async () => {
      const approved = await service.submit(studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      await service.approve(adminId, approved.id);

      const pending = await service.submit(studentId, {
        courseId: bothPlansCourseId,
        plan: 'monthly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });

      const { rows: pendingRows } = await service.adminList({ status: 'pending', page: 1, perPage: 50 });
      const pendingRow = pendingRows.find((row) => row.id === pending.id);
      expect(pendingRow).toBeDefined();
      expect(pendingRow!.approvedBefore).toBe(1);

      const { rows: approvedRows } = await service.adminList({ status: 'approved', page: 1, perPage: 50 });
      expect(approvedRows.some((row) => row.id === approved.id)).toBe(true);
    });
  });

  describe('adminManualSubscribe', () => {
    it('grants access immediately and creates an already-approved submission, for a paid entry', async () => {
      const before = new Date();
      const rows = await service.adminManualSubscribe(adminId, studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        isFree: false,
        screenshotKey: null,
      });

      const grant = await prisma.accessGrant.findFirstOrThrow({
        where: { userId: studentId, courseId: monthlyOnlyCourseId, scope: 'course', source: 'purchase' },
      });
      // Same expiry math a genuine approval would compute — see
      // `resolvePurchaseExpiry`/`computeApprovalValidUntil`.
      expect(grant.validUntil).not.toBeNull();
      expect(grant.validUntil!.getTime()).toBeGreaterThan(before.getTime());

      const enrollment = await prisma.enrollment.findUniqueOrThrow({
        where: { userId_courseId: { userId: studentId, courseId: monthlyOnlyCourseId } },
      });
      expect(enrollment.status).toBe('active');

      const submission = await prisma.paymentSubmission.findFirstOrThrow({
        where: { userId: studentId, courseId: monthlyOnlyCourseId },
      });
      // Never `pending` — there is nothing left for anyone to review.
      expect(submission.status).toBe('approved');
      expect(submission.reviewedByUserId).toBe(adminId);
      expect(submission.grantId).toBe(grant.id);
      expect(submission.isFree).toBe(false);
      // The course's own monthly price, never admin-typed.
      expect(submission.amountCents).toBe(15000);
      expect(submission.senderPhone).toBeNull();
      expect(submission.screenshotKey).toBeNull();

      const notification = await prisma.notification.findFirstOrThrow({
        where: { userId: studentId, kind: 'payment_approved' },
      });
      expect((notification.payload as Record<string, unknown>).courseId).toBe(monthlyOnlyCourseId);

      expect(rows.some((row) => row.id === grant.id)).toBe(true);
    });

    it('comps the term for free: same expiry, zero collected, never counted as revenue', async () => {
      await service.adminManualSubscribe(adminId, studentId, {
        courseId: bothPlansCourseId,
        plan: 'quarterly',
        isFree: true,
        screenshotKey: null,
      });

      const grant = await prisma.accessGrant.findFirstOrThrow({
        where: { userId: studentId, courseId: bothPlansCourseId, scope: 'course', source: 'purchase' },
      });
      // A comped term still runs the FULL plan length — free does not mean
      // open-ended. See the model note on `PaymentSubmission.isFree`.
      expect(grant.validUntil).not.toBeNull();

      const submission = await prisma.paymentSubmission.findFirstOrThrow({
        where: { userId: studentId, courseId: bothPlansCourseId },
      });
      expect(submission.isFree).toBe(true);
      // Nothing was actually collected, even though the quarterly plan is
      // worth 30000 — see `amountCollectedCents`.
      expect(submission.amountCents).toBe(0);
    });

    it('extends the existing purchase grant on a second manual subscribe, same as a renewal', async () => {
      const first = await service.adminManualSubscribe(adminId, studentId, {
        courseId: bothPlansCourseId,
        plan: 'monthly',
        isFree: false,
        screenshotKey: null,
      });
      const firstValidUntil = first.find((row) => row.courseId === bothPlansCourseId)!.validUntil!;

      const second = await service.adminManualSubscribe(adminId, studentId, {
        courseId: bothPlansCourseId,
        plan: 'quarterly',
        isFree: false,
        screenshotKey: null,
      });
      const secondValidUntil = second.find((row) => row.courseId === bothPlansCourseId)!.validUntil!;

      const grants = await prisma.accessGrant.findMany({
        where: { userId: studentId, courseId: bothPlansCourseId, scope: 'course', source: 'purchase' },
      });
      // ONE grant, extended — never a second one stacked alongside it.
      expect(grants).toHaveLength(1);
      expect(new Date(secondValidUntil).getTime()).toBeGreaterThan(new Date(firstValidUntil).getTime());
    });

    it("refuses a plan the course doesn't sell", async () => {
      await expect(
        service.adminManualSubscribe(adminId, studentId, {
          courseId: monthlyOnlyCourseId,
          plan: 'quarterly',
          isFree: false,
          screenshotKey: null,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s an unknown course', async () => {
      await expect(
        service.adminManualSubscribe(adminId, studentId, {
          courseId: randomUUID(),
          plan: 'monthly',
          isFree: false,
          screenshotKey: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s a userId with no student profile', async () => {
      await expect(
        service.adminManualSubscribe(adminId, randomUUID(), {
          courseId: monthlyOnlyCourseId,
          plan: 'monthly',
          isFree: false,
          screenshotKey: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('adminManualSubscribe — term plan', () => {
    it('grants a specific term, open-ended, and is offered even for a CLOSED term (admin override)', async () => {
      const rows = await service.adminManualSubscribe(adminId, studentId, {
        courseId: termCourseId,
        plan: 'term',
        termId: closedTermId,
        isFree: true,
        screenshotKey: null,
      });

      const grant = await prisma.accessGrant.findFirstOrThrow({
        where: { userId: studentId, courseId: termCourseId, termId: closedTermId, scope: 'term', source: 'purchase' },
      });
      expect(grant.validUntil).toBeNull();

      const row = rows.find((entry) => entry.id === grant.id);
      expect(row?.termId).toBe(closedTermId);
      expect(row?.termTitle).toBe('الترم الثاني');
      expect(row?.validUntil).toBeNull();
    });

    it('404s a termId that does not belong to the course', async () => {
      await expect(
        service.adminManualSubscribe(adminId, studentId, {
          courseId: bothPlansCourseId,
          plan: 'term',
          termId: termAId,
          isFree: true,
          screenshotKey: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('adminCancelSubscription', () => {
    it('stamps revokedAt without touching the enrollment', async () => {
      const created = await service.adminManualSubscribe(adminId, studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        isFree: false,
        screenshotKey: null,
      });
      const grantId = created.find((row) => row.courseId === monthlyOnlyCourseId)!.id;

      const rows = await service.adminCancelSubscription(adminId, studentId, grantId);

      const grant = await prisma.accessGrant.findUniqueOrThrow({ where: { id: grantId } });
      expect(grant.revokedAt).not.toBeNull();

      // No enrollment side effect — the SAME door a `validUntil` lapsing on
      // its own already walks through with no enrollment change, per
      // `adminCancelSubscription`'s own note.
      const enrollment = await prisma.enrollment.findUniqueOrThrow({
        where: { userId_courseId: { userId: studentId, courseId: monthlyOnlyCourseId } },
      });
      expect(enrollment.status).toBe('active');

      expect(rows.find((row) => row.id === grantId)?.revokedAt).not.toBeNull();
    });

    it('is idempotent on an already-cancelled subscription', async () => {
      const created = await service.adminManualSubscribe(adminId, studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        isFree: false,
        screenshotKey: null,
      });
      const grantId = created.find((row) => row.courseId === monthlyOnlyCourseId)!.id;

      await service.adminCancelSubscription(adminId, studentId, grantId);
      await expect(
        service.adminCancelSubscription(adminId, studentId, grantId),
      ).resolves.toBeDefined();
    });

    it("404s a grant id from another student's account", async () => {
      const created = await service.adminManualSubscribe(adminId, studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        isFree: false,
        screenshotKey: null,
      });
      const grantId = created.find((row) => row.courseId === monthlyOnlyCourseId)!.id;

      await expect(
        service.adminCancelSubscription(adminId, strangerId, grantId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('adminListSubscriptions', () => {
    it('reports the latest approved submission behind each grant', async () => {
      await service.adminManualSubscribe(adminId, studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        isFree: false,
        screenshotKey: null,
      });

      const rows = await service.adminListSubscriptions(studentId);
      const row = rows.find((entry) => entry.courseId === monthlyOnlyCourseId);
      expect(row).toBeDefined();
      expect(row!.plan).toBe('monthly');
      expect(row!.amountCents).toBe(15000);
      expect(row!.isFree).toBe(false);
      expect(row!.revokedAt).toBeNull();
      expect(row!.validUntil).not.toBeNull();
    });
  });
});
