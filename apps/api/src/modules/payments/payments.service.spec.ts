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
import { EntitlementService } from '../entitlement/entitlement.service';
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
  // The REAL gate, not a re-implementation of it. The month cases below assert
  // what a purchase OPENS, and asserting that against a hand-rolled grant loop
  // in this file would prove only that the loop agrees with itself — the bug
  // this whole feature has to avoid is the outline and the player disagreeing.
  const entitlement = new EntitlementService(prisma);

  let adminId = '';
  let studentId = '';
  let strangerId = '';
  let monthlyOnlyCourseId = '';
  let bothPlansCourseId = '';
  let yearlyOnlyCourseId = '';
  let termCourseId = '';
  let termAId = '';
  let closedTermId = '';
  let subjectId = '';
  let monthCourseId = '';
  let monthOneId = '';
  let monthTwoId = '';
  let closedMonthId = '';
  let lessonInMonthOneId = '';
  let lessonInMonthTwoId = '';
  let lessonWithNoMonthId = '';

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
    subjectId = subject.id;
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
          // Still priced, and deliberately so — «٣ شهور» came off the shelf
          // but the column did not, and the refusal spec below is sharper on a
          // course that WOULD have sold it.
          quarterlyPriceCents: 30000,
          yearlyPriceCents: 120000,
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

    // A course that sells BY MONTH. Three months — two open, one closed — and
    // three published lectures: one in each open month, and one carrying NO
    // month at all, which is the state that reaches a term or yearly
    // subscriber and no monthly one (see `sliceCoversLesson`). It also sells a
    // yearly plan, because the trap in `approve()` only exists for a student
    // who holds a month grant AND buys something date-based.
    monthCourseId = (
      await prisma.course.create({
        data: {
          slug: `pay-months-${stamp}`,
          title: 'كورس بيتباع بالشهر',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 3,
          instructorId: adminId,
          requiresGrant: true,
          monthlyPriceCents: 10000,
          yearlyPriceCents: 90000,
        },
      })
    ).id;

    monthOneId = (
      await prisma.courseMonth.create({
        data: { courseId: monthCourseId, monthIndex: 1, title: 'شهر ١ — سبتمبر' },
      })
    ).id;
    monthTwoId = (
      await prisma.courseMonth.create({
        data: { courseId: monthCourseId, monthIndex: 2, title: 'شهر ٢ — أكتوبر' },
      })
    ).id;
    closedMonthId = (
      await prisma.courseMonth.create({
        data: { courseId: monthCourseId, monthIndex: 3, title: 'شهر ٣ — نوفمبر', isOpen: false },
      })
    ).id;

    const monthSection = await prisma.courseSection.create({
      data: { courseId: monthCourseId, title: 'الوحدة', position: 0, isPublished: true },
    });
    const lecture = async (title: string, position: number) =>
      (
        await prisma.lesson.create({
          data: {
            courseId: monthCourseId,
            sectionId: monthSection.id,
            title,
            kind: 'text',
            position,
            isPublished: true,
            text: { create: { bodyHtml: '<p>محتوى</p>' } },
          },
        })
      ).id;
    lessonInMonthOneId = await lecture('محاضرة شهر ١', 0);
    lessonInMonthTwoId = await lecture('محاضرة شهر ٢', 1);
    lessonWithNoMonthId = await lecture('محاضرة من غير شهر', 2);

    await prisma.lessonMonth.createMany({
      data: [
        { lessonId: lessonInMonthOneId, monthId: monthOneId, courseId: monthCourseId, isPrimary: true },
        { lessonId: lessonInMonthTwoId, monthId: monthTwoId, courseId: monthCourseId, isPrimary: true },
      ],
    });
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
      where: {
        id: {
          in: [
            monthlyOnlyCourseId,
            bothPlansCourseId,
            yearlyOnlyCourseId,
            termCourseId,
            // Cascades to its sections, lessons, `course_months` and
            // `lesson_months`. Safe only because the submissions above went
            // first: `payment_submission_months.month_id` is ON DELETE
            // RESTRICT, so a leftover claim would block the course delete with
            // a foreign-key error that names the wrong table.
            monthCourseId,
          ],
        },
      },
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
      // `yearly` and not `quarterly`: quarterly is refused one step earlier
      // now, by the sellable-plan gate, which would make this pass for the
      // wrong reason. This course has no `yearlyPriceCents`.
      await expect(
        service.submit(studentId, {
          courseId: monthlyOnlyCourseId,
          plan: 'yearly',
          senderPhone: '01012345678',
          screenshotKey: validScreenshotKey(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses `quarterly` — «٣ شهور» is off the shelf, on a course that prices it', async () => {
      // `bothPlansCourseId` HAS a `quarterlyPriceCents`, so this can only be
      // the sale-path gate refusing: the plan is gone from the shop, not from
      // the schema. `PaymentPlanSchema` still parses it and every screen that
      // LISTS history still renders it — see `SellablePaymentPlanSchema`.
      await expect(
        service.submit(studentId, {
          courseId: bothPlansCourseId,
          plan: 'quarterly',
          senderPhone: '01012345678',
          screenshotKey: validScreenshotKey(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      // And nothing was written — a refused claim is not a pending one.
      const rows = await prisma.paymentSubmission.findMany({
        where: { userId: studentId, courseId: bothPlansCourseId },
      });
      expect(rows).toHaveLength(0);
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
          plan: 'yearly',
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
        plan: 'yearly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      expect(second.status).toBe('pending');
    });
  });

  describe('submit — curriculum months', () => {
    const monthClaim = (monthIds: string[], userId = studentId) =>
      service.submit(userId, {
        courseId: monthCourseId,
        plan: 'monthly',
        termId: null,
        monthIds,
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });

    it('prices one transfer as months × the COURSE monthly price and records the choice', async () => {
      const result = await monthClaim([monthOneId, monthTwoId]);

      // One payment, one screenshot, one review — «عايز شهر ٢ و٣» is not two
      // claims. The price is the course's own `monthlyPriceCents` twice over;
      // `CourseMonth.priceCents` is reserved and read by nothing.
      expect(result.amountCents).toBe(20000);

      const months = await prisma.paymentSubmissionMonth.findMany({
        where: { submissionId: result.id },
        select: { monthId: true, courseId: true },
      });
      expect(months.map((row) => row.monthId).sort()).toEqual([monthOneId, monthTwoId].sort());
      // Denormalised on every row — it is what the composite FK checks.
      expect(months.every((row) => row.courseId === monthCourseId)).toBe(true);
    });

    it('refuses an empty selection on a course that sells by month', async () => {
      await expect(monthClaim([])).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a month that is CLOSED for subscription', async () => {
      // Closing a month takes it off the shelf and nothing else — the card is
      // gone from `CatalogCourseDetail.months`, so reaching here means a stale
      // tab or a hand-written request.
      await expect(monthClaim([closedMonthId])).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a month belonging to a DIFFERENT course', async () => {
      const foreign = await prisma.courseMonth.create({
        data: { courseId: bothPlansCourseId, monthIndex: 1, title: 'شهر من كورس تاني' },
      });
      try {
        // Refused with a sentence here, not left to the composite FK to turn
        // into a 500 at write time.
        await expect(monthClaim([foreign.id])).rejects.toBeInstanceOf(BadRequestException);
      } finally {
        await prisma.courseMonth.delete({ where: { id: foreign.id } });
      }
    });

    it('refuses a month the student can already open', async () => {
      const first = await monthClaim([monthOneId]);
      await service.approve(adminId, first.id);

      // Taking the money again would be invisible: the grant write is
      // idempotent, so nothing downstream would ever have complained.
      await expect(monthClaim([monthOneId, monthTwoId])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      // ...and the month they do NOT hold is still buyable on its own.
      await expect(monthClaim([monthTwoId])).resolves.toMatchObject({ status: 'pending' });
    });

    it('treats a live YEARLY subscription as already covering every month', async () => {
      const yearly = await service.submit(studentId, {
        courseId: monthCourseId,
        plan: 'yearly',
        termId: null,
        monthIds: [],
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      await service.approve(adminId, yearly.id);

      // The checkout must not sell a month the padlock was never on — the
      // "owned" read goes through the same `monthSliceOf` the gate does, so a
      // whole-course grant covers every month without a `course_month` row.
      await expect(monthClaim([monthTwoId])).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses months on a course that does NOT sell by month', async () => {
      await expect(
        service.submit(studentId, {
          courseId: monthlyOnlyCourseId,
          plan: 'monthly',
          termId: null,
          monthIds: [monthOneId],
          senderPhone: '01012345678',
          screenshotKey: validScreenshotKey(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows a second pending claim for a DIFFERENT month', async () => {
      await monthClaim([monthOneId]);

      // «نسيت أشترك شهر ٢» while the first claim is still in the queue is a
      // real student with a real second transfer. The course-wide guard exists
      // because approval EXTENDS one grant; months are disjoint and it does
      // not apply — see `pendingClaimsBlocking`.
      await expect(monthClaim([monthTwoId])).resolves.toMatchObject({ status: 'pending' });
    });

    it('refuses a second pending claim that OVERLAPS one under review', async () => {
      await monthClaim([monthOneId]);
      await expect(monthClaim([monthOneId, monthTwoId])).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a month claim while a whole-course claim is under review', async () => {
      await service.submit(studentId, {
        courseId: monthCourseId,
        plan: 'yearly',
        termId: null,
        monthIds: [],
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });

      // A pending claim naming NO months covers everything this one would
      // buy, so it is the original race after all.
      await expect(monthClaim([monthOneId])).rejects.toBeInstanceOf(ConflictException);
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
        plan: 'yearly',
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      // The yearly plan's own price, not the monthly one the first submission
      // on this same course derived.
      expect(second.amountCents).toBe(120000);
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

  describe('approve — curriculum months', () => {
    const monthSubject = () => ({ id: monthCourseId, subjectId, requiresGrant: true });

    /** What the GATE says about one lecture, through the same service the
     *  player and the outline both go through. */
    const opens = async (lessonId: string) => {
      const rows = await prisma.lessonMonth.findMany({
        where: { lessonId },
        select: { monthId: true },
      });
      const verdict = await entitlement.resolveMonthAccess(
        studentId,
        monthSubject(),
        rows.map((row) => row.monthId),
      );
      return verdict.allowed;
    };

    const claimAndApprove = async (monthIds: string[]) => {
      const claim = await service.submit(studentId, {
        courseId: monthCourseId,
        plan: 'monthly',
        termId: null,
        monthIds,
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      return service.approve(adminId, claim.id);
    };

    it('writes one OPEN-ENDED grant per month and opens exactly those lectures', async () => {
      const result = await claimAndApprove([monthOneId]);

      // No calendar expiry anywhere on this path — «شهر ١» is content the
      // student bought, not thirty days they rented, and
      // `access_grants_month_open_ended` makes that a database rule.
      expect(result.validUntil).toBeNull();

      const grants = await prisma.accessGrant.findMany({
        where: { userId: studentId, courseId: monthCourseId, source: 'purchase' },
      });
      expect(grants).toHaveLength(1);
      expect(grants[0]?.scope).toBe('course_month');
      expect(grants[0]?.monthId).toBe(monthOneId);
      expect(grants[0]?.validUntil).toBeNull();
      // Never a whole-course grant beside it — that is the leak this feature
      // exists to close.
      expect(grants.some((grant) => grant.scope === 'course')).toBe(false);

      const enrollment = await prisma.enrollment.findUniqueOrThrow({
        where: { userId_courseId: { userId: studentId, courseId: monthCourseId } },
      });
      expect(enrollment.status).toBe('active');

      expect(await opens(lessonInMonthOneId)).toBe(true);
      expect(await opens(lessonInMonthTwoId)).toBe(false);
      // A lecture carrying no month reaches term and yearly subscribers and NO
      // monthly one — the closed default, so an untagged lecture cannot hand
      // the back-catalogue to whoever bought the cheapest month.
      expect(await opens(lessonWithNoMonthId)).toBe(false);
    });

    it('writes N grants for one multi-month transfer, and ONE notification', async () => {
      const result = await claimAndApprove([monthOneId, monthTwoId]);
      expect(result.validUntil).toBeNull();

      const grants = await prisma.accessGrant.findMany({
        where: { userId: studentId, courseId: monthCourseId, scope: 'course_month' },
      });
      expect(grants).toHaveLength(2);
      expect(grants.map((grant) => grant.monthId).sort()).toEqual([monthOneId, monthTwoId].sort());
      expect(grants.every((grant) => grant.validUntil === null)).toBe(true);

      // One transfer, one review, one «اشتراكك اتفعّل» — two identical rows in
      // the bell would read as a bug.
      const notifications = await prisma.notification.findMany({
        where: { userId: studentId, kind: 'payment_approved' },
      });
      expect(notifications).toHaveLength(1);
      expect((notifications[0]?.payload as Record<string, unknown>).validUntil).toBeNull();

      expect(await opens(lessonInMonthOneId)).toBe(true);
      expect(await opens(lessonInMonthTwoId)).toBe(true);
    });

    it('stamps the submission with a grant it actually created', async () => {
      const claim = await service.submit(studentId, {
        courseId: monthCourseId,
        plan: 'monthly',
        termId: null,
        monthIds: [monthOneId, monthTwoId],
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      await service.approve(adminId, claim.id);

      // `PaymentSubmission.grantId` is a single FK and this bought two
      // months, so it names one of them — deterministically, the earliest.
      const row = await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: claim.id } });
      const stamped = await prisma.accessGrant.findUniqueOrThrow({
        where: { id: row.grantId as string },
      });
      expect(stamped.scope).toBe('course_month');
      expect(stamped.monthId).toBe(monthOneId);
    });

    it('does not stack a second live grant for a month already held', async () => {
      await claimAndApprove([monthOneId]);
      // A second claim for the same month can only get here through the admin
      // door or a race, but two live grants for one month would mean revoking
      // it twice before the door actually closes.
      const duplicate = await prisma.paymentSubmission.create({
        data: {
          userId: studentId,
          courseId: monthCourseId,
          plan: 'monthly',
          amountCents: 10000,
          senderPhone: '01012345678',
          screenshotKey: `payment-proof/${randomUUID()}.webp`,
          months: { create: { monthId: monthOneId, courseId: monthCourseId } },
        },
      });

      await service.approve(adminId, duplicate.id);

      const grants = await prisma.accessGrant.findMany({
        where: { userId: studentId, courseId: monthCourseId, monthId: monthOneId, revokedAt: null },
      });
      expect(grants).toHaveLength(1);
    });

    it('approves a YEARLY plan for a student who already holds a month grant — no 23514', async () => {
      await claimAndApprove([monthOneId]);

      const yearly = await service.submit(studentId, {
        courseId: monthCourseId,
        plan: 'yearly',
        termId: null,
        monthIds: [],
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });

      /*
        The trap. `resolvePurchaseExpiry` looks for "the live purchase grant
        for this course"; if that findFirst ever stopped being
        `scope: 'course'`-only it would pick the MONTH grant up and
        `writePurchaseGrant` would UPDATE a `validUntil` onto it —
        `access_grants_month_open_ended` is a CHECK, so that is a 23514 that
        rolls the whole approval back and 500s a real student's payment.
      */
      const result = await service.approve(adminId, yearly.id);
      expect(result.validUntil).not.toBeNull();

      const monthGrant = await prisma.accessGrant.findFirstOrThrow({
        where: { userId: studentId, courseId: monthCourseId, scope: 'course_month' },
      });
      expect(monthGrant.validUntil).toBeNull();

      const courseGrant = await prisma.accessGrant.findFirstOrThrow({
        where: { userId: studentId, courseId: monthCourseId, scope: 'course' },
      });
      expect(courseGrant.validUntil).not.toBeNull();

      // And the year is not narrowed to the month: the union is what decides,
      // never the newest single grant.
      expect(await opens(lessonInMonthTwoId)).toBe(true);
      expect(await opens(lessonWithNoMonthId)).toBe(true);
    });

    it('still writes the OLD dated `scope: course` grant on a course with no months', async () => {
      const claim = await service.submit(studentId, {
        courseId: monthlyOnlyCourseId,
        plan: 'monthly',
        termId: null,
        monthIds: [],
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      const result = await service.approve(adminId, claim.id);

      // The backward-compatibility path, unchanged to the byte: a rolling
      // thirty-day window that opens the whole course.
      expect(result.validUntil).not.toBeNull();
      const grants = await prisma.accessGrant.findMany({
        where: { userId: studentId, courseId: monthlyOnlyCourseId, source: 'purchase' },
      });
      expect(grants).toHaveLength(1);
      expect(grants[0]?.scope).toBe('course');
      expect(grants[0]?.monthId).toBeNull();
      expect(grants[0]?.validUntil).not.toBeNull();
    });
  });

  describe('listOwnedMonths', () => {
    it('names only the open months the student holds a live grant for', async () => {
      const claim = await service.submit(studentId, {
        courseId: monthCourseId,
        plan: 'monthly',
        termId: null,
        monthIds: [monthTwoId],
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      await service.approve(adminId, claim.id);

      expect(await service.listOwnedMonths(studentId, monthCourseId)).toEqual({
        ownedMonthIds: [monthTwoId],
      });
      // Another student's purchase is not this student's — `userId` comes off
      // the session, never the URL.
      expect(await service.listOwnedMonths(strangerId, monthCourseId)).toEqual({
        ownedMonthIds: [],
      });
    });

    it('counts a whole-course subscription as covering every month on sale', async () => {
      const yearly = await service.submit(studentId, {
        courseId: monthCourseId,
        plan: 'yearly',
        termId: null,
        monthIds: [],
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      await service.approve(adminId, yearly.id);

      const owned = await service.listOwnedMonths(studentId, monthCourseId);
      expect(owned.ownedMonthIds.sort()).toEqual([monthOneId, monthTwoId].sort());
      // The closed month has no card in the picker, so it is not something
      // this answer has to say anything about.
      expect(owned.ownedMonthIds).not.toContain(closedMonthId);
    });

    it('drops a revoked month grant — `revokedAt` is a month subscription\'s only cutoff', async () => {
      const claim = await service.submit(studentId, {
        courseId: monthCourseId,
        plan: 'monthly',
        termId: null,
        monthIds: [monthOneId],
        senderPhone: '01012345678',
        screenshotKey: validScreenshotKey(),
      });
      await service.approve(adminId, claim.id);
      await prisma.accessGrant.updateMany({
        where: { userId: studentId, courseId: monthCourseId, scope: 'course_month' },
        data: { revokedAt: new Date() },
      });

      expect(await service.listOwnedMonths(studentId, monthCourseId)).toEqual({
        ownedMonthIds: [],
      });
    });

    it('404s an unknown course', async () => {
      await expect(service.listOwnedMonths(studentId, randomUUID())).rejects.toBeInstanceOf(
        NotFoundException,
      );
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
