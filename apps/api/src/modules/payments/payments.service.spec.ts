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
    await prisma.course.deleteMany({ where: { id: { in: [monthlyOnlyCourseId, bothPlansCourseId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, strangerId, adminId] } } });
    await prisma.$disconnect();
  });

  const validScreenshotKey = () => `payment-proof/${randomUUID()}.webp`;

  describe('submit', () => {
    it('creates a pending submission for a plan the course sells', async () => {
      const result = await service.submit(studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        amountCents: 15000,
        screenshotKey: validScreenshotKey(),
      });

      expect(result.status).toBe('pending');
      expect(result.validUntil).toBeNull();
      expect(result.courseId).toBe(monthlyOnlyCourseId);

      const row = await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: result.id } });
      expect(row.userId).toBe(studentId);
      expect(row.amountCents).toBe(15000);
    });

    it('rejects a screenshotKey not issued by the upload step', async () => {
      await expect(
        service.submit(studentId, {
          courseId: monthlyOnlyCourseId,
          plan: 'monthly',
          amountCents: 15000,
          screenshotKey: 'course-cover/not-a-payment-proof.webp',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s an unknown course', async () => {
      await expect(
        service.submit(studentId, {
          courseId: randomUUID(),
          plan: 'monthly',
          amountCents: 15000,
          screenshotKey: validScreenshotKey(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a plan the course does not sell', async () => {
      await expect(
        service.submit(studentId, {
          courseId: monthlyOnlyCourseId,
          plan: 'quarterly',
          amountCents: 30000,
          screenshotKey: validScreenshotKey(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a second pending submission for the same course', async () => {
      await service.submit(studentId, {
        courseId: bothPlansCourseId,
        plan: 'monthly',
        amountCents: 15000,
        screenshotKey: validScreenshotKey(),
      });

      await expect(
        service.submit(studentId, {
          courseId: bothPlansCourseId,
          plan: 'quarterly',
          amountCents: 30000,
          screenshotKey: validScreenshotKey(),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows a fresh submission once the earlier one was reviewed', async () => {
      const first = await service.submit(studentId, {
        courseId: bothPlansCourseId,
        plan: 'monthly',
        amountCents: 15000,
        screenshotKey: validScreenshotKey(),
      });
      await service.reject(adminId, first.id, { reason: 'not clear' });

      const second = await service.submit(studentId, {
        courseId: bothPlansCourseId,
        plan: 'quarterly',
        amountCents: 30000,
        screenshotKey: validScreenshotKey(),
      });
      expect(second.status).toBe('pending');
    });
  });

  describe('approve', () => {
    it('creates a purchase grant, activates enrollment, and notifies the student', async () => {
      const submission = await service.submit(studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        amountCents: 15000,
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
        amountCents: 15000,
        screenshotKey: validScreenshotKey(),
      });
      const firstResult = await service.approve(adminId, first.id);

      const second = await service.submit(studentId, {
        courseId: bothPlansCourseId,
        plan: 'quarterly',
        amountCents: 30000,
        screenshotKey: validScreenshotKey(),
      });
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
        amountCents: 15000,
        screenshotKey: validScreenshotKey(),
      });
      await service.approve(adminId, submission.id);

      await expect(service.approve(adminId, submission.id)).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s an unknown submission', async () => {
      await expect(service.approve(adminId, randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reject', () => {
    it('records the reason and notifies the student, without creating a grant', async () => {
      const submission = await service.submit(studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        amountCents: 15000,
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
        amountCents: 15000,
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
        amountCents: 15000,
        screenshotKey: validScreenshotKey(),
      });
      await service.reject(adminId, mine1.id, { reason: 'no' });
      const mine2 = await service.submit(studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        amountCents: 15000,
        screenshotKey: validScreenshotKey(),
      });

      await service.submit(strangerId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        amountCents: 15000,
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
        amountCents: 15000,
        screenshotKey: validScreenshotKey(),
      });
      await service.approve(adminId, approved.id);

      const pending = await service.submit(studentId, {
        courseId: bothPlansCourseId,
        plan: 'monthly',
        amountCents: 15000,
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
});
