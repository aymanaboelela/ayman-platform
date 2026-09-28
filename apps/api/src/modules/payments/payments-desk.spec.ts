// Same reasoning as `payments.service.spec.ts`: Prisma 7 does not auto-load
// .env, and this spec runs outside Nest's bootstrap.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsRealtimeService } from '../notifications/notifications-realtime.service';
import type { MediaService } from '../media/media.service';
import { BookOrdersService } from '../book-orders/book-orders.service';
import { PaymentsService } from './payments.service';
import { TransfersService } from './transfers.service';

/**
 * «The payments desk moved» — the frame `/admin/payments` redraws on.
 *
 * The owner's complaint was that a new request only showed after a manual
 * refresh. The screen half is the web app's; THIS is the half that says
 * something happened at all, and it has to say it on every write that
 * changes what the desk shows — including the one nobody clicks (a transfer
 * approving a claim on its own), which is exactly the write no admin screen
 * would otherwise ever hear about.
 *
 * Real Postgres (the count rides along and is a database fact), a real
 * `NotificationsService`, and a real `NotificationsRealtimeService` with no
 * Redis behind it — its `publishQueue` is spied on, so what is asserted is
 * exactly what would have gone out on the wire.
 */
describe('the payments desk announces itself', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const audit = new AuditService(prisma);
  const realtime = new NotificationsRealtimeService();
  const publishQueue = jest.spyOn(realtime, 'publishQueue');
  const notifications = new NotificationsService(prisma, realtime);
  const media = {} as unknown as MediaService;
  const payments = new PaymentsService(prisma, audit, notifications, media);
  // Same partial construction `transfers.service.spec.ts` uses: only
  // `markPaidFromTransfer` is reachable from `ingest`, and nothing here gets
  // that far — no book order is ever outstanding at these amounts.
  const bookOrders = Object.assign(Object.create(BookOrdersService.prototype), {
    prisma,
    audit,
    notifications,
  }) as BookOrdersService;
  const transfers = new TransfersService(prisma, audit, payments, bookOrders);

  let adminId = '';
  let studentId = '';
  let courseId = '';

  // Not a round number: the dev database holds real rows, and an amount this
  // spec shares with one of them would settle a claim no test wrote.
  const PRICE_CENTS = 91_300;
  const HANDLE = 'desk-spec@instapay';

  const pendingNow = () => prisma.paymentSubmission.count({ where: { status: 'pending' } });

  /** The frames published since the last `mockClear`, as they went out. */
  const frames = () => publishQueue.mock.calls.map(([queue, waiting]) => ({ queue, waiting }));

  const claim = () =>
    payments.submit(studentId, {
      courseId,
      plan: 'monthly',
      termId: null,
      senderPhone: '01012345678',
      screenshotKey: 'payment-proof/desk.webp',
    });

  const wipe = async () => {
    await prisma.studentPaymentAddress.deleteMany({ where: { handle: HANDLE } });
    await prisma.incomingTransfer.deleteMany({ where: { amountCents: PRICE_CENTS } });
    await prisma.paymentSubmission.deleteMany({ where: { userId: studentId } });
    await prisma.accessGrant.deleteMany({ where: { userId: studentId } });
    await prisma.enrollment.deleteMany({ where: { userId: studentId } });
    await prisma.notification.deleteMany({ where: { userId: studentId } });
  };

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    adminId = (
      await prisma.user.create({
        data: { id: `desk-admin-${stamp}`, name: 'أدمن', email: `desk-admin-${stamp}@t.test`, role: 'admin' },
      })
    ).id;
    studentId = (
      await prisma.user.create({
        data: { id: `desk-student-${stamp}`, name: 'طالب', email: `desk-student-${stamp}@t.test` },
      })
    ).id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    courseId = (
      await prisma.course.create({
        data: {
          slug: `desk-course-${stamp}`,
          title: 'كورس المكتب',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 2,
          instructorId: adminId,
          requiresGrant: true,
          monthlyPriceCents: PRICE_CENTS,
        },
      })
    ).id;
  });

  beforeEach(async () => {
    await wipe();
    publishQueue.mockClear();
  });

  afterAll(async () => {
    await wipe();
    // Never `deleteMany` on `audit_log` — INSERT-only at the database level.
    await prisma.notification.deleteMany({ where: { userId: adminId } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, adminId] } } });
    await prisma.$disconnect();
  });

  it('a new claim — the frame the review screen puts the row on, with the pending count', async () => {
    await claim();

    expect(frames()).toEqual([{ queue: 'payments', waiting: await pendingNow() }]);
  });

  it('an approval — the row leaves every other admin’s queue too', async () => {
    const submission = await claim();
    publishQueue.mockClear();

    await payments.approve(adminId, submission.id);

    expect(frames()).toEqual([{ queue: 'payments', waiting: await pendingNow() }]);
  });

  it('a rejection', async () => {
    const submission = await claim();
    publishQueue.mockClear();

    await payments.reject(adminId, submission.id, { reason: 'الصورة مش واضحة' });

    expect(frames()).toEqual([{ queue: 'payments', waiting: await pendingNow() }]);
  });

  it('a transfer approving a claim on its own — the write no admin clicked', async () => {
    const submission = await claim();
    publishQueue.mockClear();

    const result = await transfers.ingest({
      text: `لقد استلمت ${(PRICE_CENTS / 100).toFixed(2)} جنيه من ${HANDLE}`,
    });

    expect(result.matched).toBe(1);
    const row = await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(row.status).toBe('approved');
    // Once for the approval, once for the ledger row it left behind.
    expect(frames().length).toBeGreaterThanOrEqual(1);
    expect(frames().at(-1)).toEqual({ queue: 'payments', waiting: await pendingNow() });
  });

  it('a transfer that settles nothing still redraws the ledger — and a repeat of it does not', async () => {
    const text = `لقد استلمت ${(PRICE_CENTS / 100).toFixed(2)} جنيه من ${HANDLE}`;

    await transfers.ingest({ text });
    expect(frames()).toHaveLength(1);

    publishQueue.mockClear();
    const again = await transfers.ingest({ text });
    expect(again.duplicates).toBe(1);
    expect(frames()).toEqual([]);
  });

  it('dismissing a ledger row', async () => {
    await transfers.ingest({ text: `لقد استلمت ${(PRICE_CENTS / 100).toFixed(2)} جنيه من ${HANDLE}` });
    const row = await prisma.incomingTransfer.findFirstOrThrow({ where: { amountCents: PRICE_CENTS } });
    publishQueue.mockClear();

    await transfers.dismiss(adminId, row.id);
    expect(frames()).toHaveLength(1);

    // Already dismissed — nothing moved, nothing to say.
    publishQueue.mockClear();
    await transfers.dismiss(adminId, row.id);
    expect(frames()).toEqual([]);
  });
});
