// Same reasoning as `payments.service.spec.ts`: Prisma 7 does not auto-load
// .env, and this spec runs outside Nest's bootstrap.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { MediaService } from '../media/media.service';
import { PaymentsService } from './payments.service';
import { BookOrdersService } from '../book-orders/book-orders.service';
import { TransfersService } from './transfers.service';

/**
 * The end of «هو دفع فعلاً ولا لأ» — learning whose InstaPay address is whose,
 * and approving on it afterwards.
 *
 * Against real Postgres, like the payments spec beside it, because the facts
 * worth proving are database facts: that one address cannot belong to two
 * students, and that ingesting the same notification twice cannot approve
 * twice.
 */
describe('TransfersService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const audit = new AuditService(prisma);
  const notifications = new NotificationsService(prisma);
  const media = {} as unknown as MediaService;
  const payments = new PaymentsService(prisma, audit, notifications, media);
  // Only `markPaidFromTransfer` is reached from here, and it touches Prisma,
  // notifications and audit — all real. The constructor's other dependencies
  // (media, books pricing, marketing) are never entered by that method.
  const bookOrders = Object.assign(Object.create(BookOrdersService.prototype), {
    prisma,
    audit,
    notifications,
  }) as BookOrdersService;
  const service = new TransfersService(prisma, audit, payments, bookOrders);

  let governorateCode = '';
  let adminId = '';
  let studentId = '';
  let otherStudentId = '';
  let courseId = '';
  let otherCourseId = '';

  // Deliberately not a round 250: the dev database is a real cohort, and an
  // amount this spec shares with live rows would match claims no test wrote.
  const PRICE_CENTS = 98_700;
  const OTHER_PRICE_CENTS = 76_300;

  const HANDLE = 'moazkoritam@instapay';
  const OTHER_HANDLE = 'rokaia1712@instapay';

  const notificationFor = (cents: number, handle = HANDLE) =>
    `لقد استلمت ${(cents / 100).toFixed(2)} جنيه من ${handle}`;
  const smsFor = (cents: number) => `تم اضافة مبلغ ${cents / 100}EGP الى حساب رقم xxx1734`;

  const claim = (userId: string, course: string) =>
    payments.submit(userId, {
      courseId: course,
      plan: 'monthly',
      termId: null,
      senderPhone: '01012345678',
      screenshotKey: 'payment-proof/whatever.webp',
    });

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    adminId = (
      await prisma.user.create({
        data: { id: `tr-admin-${stamp}`, name: 'أدمن', email: `tr-admin-${stamp}@t.test`, role: 'admin' },
      })
    ).id;
    studentId = (
      await prisma.user.create({
        data: { id: `tr-student-${stamp}`, name: 'طالب', email: `tr-student-${stamp}@t.test` },
      })
    ).id;
    otherStudentId = (
      await prisma.user.create({
        data: { id: `tr-other-${stamp}`, name: 'طالب تاني', email: `tr-other-${stamp}@t.test` },
      })
    ).id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    governorateCode = (await prisma.governorate.findFirstOrThrow()).code;

    const makeCourse = async (slug: string, title: string, priceCents: number) =>
      (
        await prisma.course.create({
          data: {
            slug,
            title,
            status: 'published',
            publishedAt: new Date(),
            systemId: system.id,
            subjectId: subject.id,
            year: 2,
            instructorId: adminId,
            requiresGrant: true,
            monthlyPriceCents: priceCents,
          },
        })
      ).id;

    courseId = await makeCourse(`tr-course-${stamp}`, 'كورس التحويلات', PRICE_CENTS);
    otherCourseId = await makeCourse(`tr-other-course-${stamp}`, 'كورس تاني', OTHER_PRICE_CENTS);
  });

  /** An order sitting at `address_only` — the basket a student filled in and
   *  has not paid for yet, which is exactly what a transfer settles. */
  const bookOrder = async (userId: string | null, amountCents: number) =>
    prisma.bookOrder.create({
      data: {
        userId,
        amountCents,
        itemsCents: amountCents,
        fullName: 'طالب',
        phone: '01012345678',
        altPhone: '01087654321',
        governorateCode,
        city: 'القاهرة',
        addressStreet: 'شارع',
      },
      select: { id: true },
    });

  const wipe = async () => {
    // Transfers first: `incoming_transfers.matched_submission_id` points at
    // the submissions deleted below, and addresses point back at transfers.
    await prisma.studentPaymentAddress.deleteMany({
      where: { handle: { in: [HANDLE, OTHER_HANDLE] } },
    });
    await prisma.incomingTransfer.deleteMany({
      where: { amountCents: { in: [PRICE_CENTS, OTHER_PRICE_CENTS, PRICE_CENTS + 100_000] } },
    });
    await prisma.bookOrder.deleteMany({
      where: { amountCents: { in: [PRICE_CENTS, OTHER_PRICE_CENTS, PRICE_CENTS + 100_000] } },
    });
    await prisma.paymentSubmission.deleteMany({ where: { userId: { in: [studentId, otherStudentId] } } });
    await prisma.accessGrant.deleteMany({ where: { userId: { in: [studentId, otherStudentId] } } });
    await prisma.enrollment.deleteMany({ where: { userId: { in: [studentId, otherStudentId] } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [studentId, otherStudentId] } } });
  };

  beforeEach(wipe);

  afterAll(async () => {
    await wipe();
    // Never `deleteMany` on `audit_log` — INSERT-only at the database level.
    await prisma.course.deleteMany({ where: { id: { in: [courseId, otherCourseId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, otherStudentId, adminId] } } });
    await prisma.$disconnect();
  });

  describe('the first payment from an address nobody has claimed', () => {
    it('approves the one claim it can only be paying for, and learns the address', async () => {
      const filed = await claim(studentId, courseId);

      const result = await service.ingest({ text: notificationFor(PRICE_CENTS) });

      expect(result).toMatchObject({ read: 1, created: 1, matched: 1 });

      const submission = await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: filed.id } });
      expect(submission).toMatchObject({ status: 'approved', reviewedByUserId: null });

      const grant = await prisma.accessGrant.findFirstOrThrow({ where: { userId: studentId, courseId } });
      // Nobody issued it. The note carries what did.
      expect(grant.grantedByUserId).toBeNull();
      expect(grant.note).toContain('instapay');

      const learned = await prisma.studentPaymentAddress.findUniqueOrThrow({ where: { handle: HANDLE } });
      expect(learned.userId).toBe(studentId);
    });

    // Two claims for the same money is a question, not an answer.
    it('approves nothing when two students are waiting on the same amount', async () => {
      await claim(studentId, courseId);
      await claim(otherStudentId, courseId);

      const result = await service.ingest({ text: notificationFor(PRICE_CENTS) });

      expect(result).toMatchObject({ created: 1, matched: 0 });
      expect(await prisma.accessGrant.count({ where: { courseId } })).toBe(0);
      expect(await prisma.studentPaymentAddress.count({ where: { handle: HANDLE } })).toBe(0);
    });

    it('keeps money nobody was waiting for, and grants nothing', async () => {
      const result = await service.ingest({ text: notificationFor(PRICE_CENTS + 100_000) });

      expect(result).toMatchObject({ created: 1, matched: 0 });
      const transfer = await prisma.incomingTransfer.findFirstOrThrow({
        where: { amountCents: PRICE_CENTS + 100_000 },
      });
      expect(transfer.matchedSubmissionId).toBeNull();
    });
  });

  describe('once the address is known', () => {
    beforeEach(async () => {
      await prisma.studentPaymentAddress.create({ data: { userId: studentId, handle: HANDLE } });
    });

    it('approves that student’s claim even while someone else waits on the same amount', async () => {
      const mine = await claim(studentId, courseId);
      const theirs = await claim(otherStudentId, courseId);

      const result = await service.ingest({ text: notificationFor(PRICE_CENTS) });

      expect(result).toMatchObject({ matched: 1 });
      expect((await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe(
        'approved',
      );
      // The other student is untouched — the address said whose money this is.
      expect((await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: theirs.id } })).status).toBe(
        'pending',
      );
    });

    // The address says WHO, never WHAT FOR. A student who owes 987 and sends
    // 763 has not paid for the thing they claimed.
    it('approves nothing when the amount is not the amount claimed', async () => {
      await claim(studentId, courseId);

      const result = await service.ingest({ text: notificationFor(OTHER_PRICE_CENTS) });

      expect(result).toMatchObject({ matched: 0 });
      expect(await prisma.accessGrant.count({ where: { userId: studentId } })).toBe(0);
    });

    it('leaves money from a known student who is not waiting on anything', async () => {
      const result = await service.ingest({ text: notificationFor(PRICE_CENTS) });

      expect(result).toMatchObject({ created: 1, matched: 0 });
      const [row] = (await service.adminList('unmatched', 100)).rows;
      // The row still names him, which is the whole point of having learned it.
      expect(row?.senderStudentName).toBe('طالب');
    });

    it('approves once, however many times the same notification arrives', async () => {
      await claim(studentId, courseId);
      const text = notificationFor(PRICE_CENTS);

      await service.ingest({ text });
      const second = await service.ingest({ text });

      expect(second).toMatchObject({ created: 0, matched: 0, duplicates: 1 });
      expect(await prisma.accessGrant.count({ where: { userId: studentId, courseId } })).toBe(1);
      expect(await prisma.paymentSubmission.count({ where: { userId: studentId, courseId } })).toBe(1);
    });
  });

  describe('the bank SMS', () => {
    // It names no sender. Approving on "one claim happens to be for this
    // amount" alone would open a course off a transfer from anybody.
    it('never approves anything on its own', async () => {
      await claim(studentId, courseId);

      const result = await service.ingest({ text: smsFor(PRICE_CENTS) });

      expect(result).toMatchObject({ created: 1, matched: 0 });
      expect(await prisma.accessGrant.count({ where: { userId: studentId } })).toBe(0);
    });

    it('is upgraded and settled when the InstaPay notification for it arrives', async () => {
      await claim(studentId, courseId);

      await service.ingest({ text: smsFor(PRICE_CENTS) });
      const second = await service.ingest({ text: notificationFor(PRICE_CENTS) });

      expect(second).toMatchObject({ duplicates: 1, matched: 1 });
      const transfers = await prisma.incomingTransfer.findMany({ where: { amountCents: PRICE_CENTS } });
      expect(transfers).toHaveLength(1);
      expect(transfers[0]).toMatchObject({ source: 'notification', senderHandle: HANDLE });
      expect(await prisma.accessGrant.count({ where: { userId: studentId, courseId } })).toBe(1);
    });
  });

  describe('learnFromApproval — the path this is really built around', () => {
    it('binds the address an admin just approved against, and links the money to it', async () => {
      const filed = await claim(studentId, courseId);
      await service.ingest({ text: notificationFor(PRICE_CENTS, OTHER_HANDLE) });
      // Undo what the ingest inferred, so this test exercises the admin path
      // rather than the automatic one.
      await prisma.studentPaymentAddress.deleteMany({ where: { handle: OTHER_HANDLE } });
      await prisma.incomingTransfer.updateMany({
        where: { amountCents: PRICE_CENTS },
        data: { matchedSubmissionId: null },
      });
      await prisma.paymentSubmission.update({
        where: { id: filed.id },
        data: { status: 'pending', reviewedAt: null, grantId: null },
      });

      await service.learnFromApproval(filed.id);

      const learned = await prisma.studentPaymentAddress.findUniqueOrThrow({
        where: { handle: OTHER_HANDLE },
      });
      expect(learned.userId).toBe(studentId);
      const transfer = await prisma.incomingTransfer.findFirstOrThrow({
        where: { amountCents: PRICE_CENTS },
      });
      expect(transfer.matchedSubmissionId).toBe(filed.id);
    });

    // Binding the wrong address would make FUTURE approvals wrong, which is
    // far worse than learning nothing today.
    it('learns nothing when two transfers could equally be the one', async () => {
      const filed = await claim(studentId, courseId);
      await prisma.incomingTransfer.createMany({
        data: [
          {
            source: 'notification',
            amountCents: PRICE_CENTS,
            senderHandle: HANDLE,
            rawLine: 'a',
            receivedAt: new Date(),
          },
          {
            source: 'notification',
            amountCents: PRICE_CENTS,
            senderHandle: OTHER_HANDLE,
            rawLine: 'b',
            receivedAt: new Date(),
          },
        ],
      });

      await service.learnFromApproval(filed.id);

      expect(
        await prisma.studentPaymentAddress.count({ where: { handle: { in: [HANDLE, OTHER_HANDLE] } } }),
      ).toBe(0);
    });
  });

  describe('الكتب — the same ledger settles a printed book', () => {
    it('marks an unpaid order paid when its own total arrives from a known address', async () => {
      await prisma.studentPaymentAddress.create({ data: { userId: studentId, handle: HANDLE } });
      const order = await bookOrder(studentId, OTHER_PRICE_CENTS);

      const result = await service.ingest({ text: notificationFor(OTHER_PRICE_CENTS) });

      expect(result).toMatchObject({ matched: 1 });
      const paid = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(paid.status).toBe('paid');
      expect(paid.paidAt).not.toBeNull();
      // Nobody uploaded anything. The transfer is the evidence, and it points
      // back at the order.
      expect(paid.screenshotKey).toBeNull();
      const transfer = await prisma.incomingTransfer.findFirstOrThrow({
        where: { amountCents: OTHER_PRICE_CENTS },
      });
      expect(transfer.matchedBookOrderId).toBe(order.id);
      expect(transfer.matchedSubmissionId).toBeNull();
    });

    it('learns the address off a first book payment too', async () => {
      await bookOrder(studentId, OTHER_PRICE_CENTS);

      await service.ingest({ text: notificationFor(OTHER_PRICE_CENTS) });

      const learned = await prisma.studentPaymentAddress.findUniqueOrThrow({ where: { handle: HANDLE } });
      expect(learned.userId).toBe(studentId);
    });

    // Money that could be either a subscription or a book is money nobody
    // should settle automatically — and only counting both together sees it.
    it('settles nothing when a claim and an order want the same amount', async () => {
      await prisma.studentPaymentAddress.create({ data: { userId: studentId, handle: HANDLE } });
      await claim(studentId, courseId);
      const order = await bookOrder(studentId, PRICE_CENTS);

      const result = await service.ingest({ text: notificationFor(PRICE_CENTS) });

      expect(result).toMatchObject({ matched: 0 });
      expect((await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
        'address_only',
      );
      expect(await prisma.accessGrant.count({ where: { userId: studentId } })).toBe(0);
    });

    it('leaves an order that was already paid alone', async () => {
      await prisma.studentPaymentAddress.create({ data: { userId: studentId, handle: HANDLE } });
      const order = await bookOrder(studentId, OTHER_PRICE_CENTS);
      await prisma.bookOrder.update({
        where: { id: order.id },
        data: { status: 'paid', paidAt: new Date() },
      });

      const result = await service.ingest({ text: notificationFor(OTHER_PRICE_CENTS) });

      expect(result).toMatchObject({ created: 1, matched: 0 });
      const transfer = await prisma.incomingTransfer.findFirstOrThrow({
        where: { amountCents: OTHER_PRICE_CENTS },
      });
      expect(transfer.matchedBookOrderId).toBeNull();
    });
  });

  describe('adminList', () => {
    it('splits matched from unmatched, and names the student behind each', async () => {
      const filed = await claim(studentId, courseId);
      await service.ingest({ text: notificationFor(PRICE_CENTS) });
      await service.ingest({ text: notificationFor(PRICE_CENTS + 100_000, OTHER_HANDLE) });

      const matched = await service.adminList('matched', 100);
      const unmatched = await service.adminList('unmatched', 100);

      const paid = matched.rows.find((row) => row.amountCents === PRICE_CENTS);
      expect(paid).toMatchObject({ matchedStudentName: 'طالب', matchedCourseTitle: 'كورس التحويلات' });
      expect(paid?.matchedSubmissionId).toBe(filed.id);
      expect(unmatched.rows.some((row) => row.amountCents === PRICE_CENTS + 100_000)).toBe(true);
    });

    it('takes a dismissed transfer out of the queue without deleting it', async () => {
      await service.ingest({ text: notificationFor(PRICE_CENTS + 100_000) });
      const [row] = (await service.adminList('unmatched', 100)).rows;

      await service.dismiss(adminId, row?.id as string);

      const unmatched = await service.adminList('unmatched', 100);
      const dismissed = await service.adminList('dismissed', 100);
      expect(unmatched.rows.some((candidate) => candidate.id === row?.id)).toBe(false);
      expect(dismissed.rows.some((candidate) => candidate.id === row?.id)).toBe(true);
    });
  });
});
