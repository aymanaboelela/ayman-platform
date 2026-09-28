// Prisma 7 does not auto-load .env, and this spec runs outside Nest's bootstrap.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import type Redis from 'ioredis';
import { HttpException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { MediaService } from '../media/media.service';
import { PaymentsService } from '../payments/payments.service';
import { FinanceService } from '../payments/finance.service';
import { FinanceDailyService } from '../payments/finance-daily.service';
import { FinanceOverviewService } from '../expenses/finance-overview.service';
import { UnlockAttemptsService } from '../unlock-codes/unlock-attempts.service';
import { UnlockCodesService } from '../unlock-codes/unlock-codes.service';
import { WalletService } from './wallet.service';
import { WalletInsufficientError, creditWallet, debitWallet } from './wallet-ledger';

/**
 * «المحفظة», against the real database — because every promise here is a
 * database promise: a balance that cannot go below zero under two concurrent
 * purchases, a code or a request that cannot credit twice, a ledger nobody can
 * rewrite, and money that finance counts exactly once.
 *
 * Each test states the promise, not the code path. Fixture ids carry a per-run
 * stamp; cleanup deletes the USERS, never ledger rows (the ledger refuses a
 * direct DELETE — that refusal has its own test below).
 */

const noRedis = {
  pttl: async () => -2,
  incr: async () => 1,
  expire: async () => 1,
  set: async () => 'OK',
  del: async () => 1,
} as unknown as Redis;

/** The code a 4xx carries in its body — what the web switches on. */
function codeOf(error: unknown): string | undefined {
  if (!(error instanceof HttpException)) return undefined;
  const body = error.getResponse();
  return typeof body === 'object' && body !== null ? (body as { code?: string }).code : undefined;
}

describe('the wallet', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const audit = new AuditService(prisma);
  const notifications = new NotificationsService(prisma);
  const wallet = new WalletService(prisma, audit, notifications);
  const payments = new PaymentsService(prisma, audit, notifications, {} as unknown as MediaService);
  const finance = new FinanceService(prisma, audit, notifications);
  const daily = new FinanceDailyService(prisma);
  const overview = new FinanceOverviewService(prisma);
  const codes = new UnlockCodesService(prisma, audit, new UnlockAttemptsService(noRedis));

  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let adminId = '';
  let courseId = '';
  let monthCourseId = '';
  let monthOneId = '';
  let monthTwoId = '';
  let governorateCode = '';

  // Odd prices, so nothing here collides with a real row on the dev database.
  const MONTHLY = 31_700;
  const MONTH_PRICE = 12_300;

  let seq = 0;
  async function student(): Promise<string> {
    seq += 1;
    const id = `wal-stu-${stamp}-${seq}`;
    await prisma.user.create({ data: { id, name: 'طالب المحفظة', email: `${id}@t.test` } });
    await prisma.studentProfile.create({
      data: {
        userId: id,
        fullName: 'طالب المحفظة',
        gender: 'female',
        phone: `0109${String(Date.now() + seq).slice(-7)}`,
        governorateCode,
        year: 2,
      },
    });
    return id;
  }

  const ledgerSum = async (userId: string) =>
    (await prisma.walletTransaction.aggregate({ where: { userId }, _sum: { amountCents: true } }))._sum
      .amountCents ?? 0;
  const balanceOf = async (userId: string) =>
    (await prisma.wallet.findUnique({ where: { userId } }))?.balanceCents ?? 0;
  const credit = (userId: string, amountCents: number, paid = true) =>
    wallet.credit(adminId, userId, { amountCents, paid, note: null, idempotencyKey: randomUUID() });

  beforeAll(async () => {
    await prisma.$connect();
    adminId = (
      await prisma.user.create({
        data: { id: `wal-admin-${stamp}`, name: 'أدمن', email: `wal-admin-${stamp}@t.test`, role: 'admin' },
      })
    ).id;
    governorateCode = (await prisma.governorate.findFirstOrThrow()).code;
    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const base = {
      status: 'published' as const,
      publishedAt: new Date(),
      systemId: system.id,
      subjectId: subject.id,
      year: 2,
      instructorId: adminId,
      requiresGrant: true,
    };
    courseId = (
      await prisma.course.create({
        data: { ...base, slug: `wal-course-${stamp}`, title: 'كورس المحفظة', monthlyPriceCents: MONTHLY },
      })
    ).id;
    monthCourseId = (
      await prisma.course.create({
        data: { ...base, slug: `wal-months-${stamp}`, title: 'كورس بالشهر', monthlyPriceCents: MONTH_PRICE },
      })
    ).id;
    monthOneId = (
      await prisma.courseMonth.create({ data: { courseId: monthCourseId, monthIndex: 1, title: 'شهر ١' } })
    ).id;
    monthTwoId = (
      await prisma.courseMonth.create({ data: { courseId: monthCourseId, monthIndex: 2, title: 'شهر ٢' } })
    ).id;
  });

  afterAll(async () => {
    // Users first: their cascade is the ONE way ledger rows may leave.
    await prisma.user.deleteMany({ where: { id: { startsWith: `wal-stu-${stamp}` } } });
    await prisma.unlockCode.deleteMany({ where: { createdByUserId: adminId, redeemedAt: null } });
    await prisma.course.deleteMany({ where: { id: { in: [courseId, monthCourseId] } } });
    await prisma.notification.deleteMany({ where: { userId: adminId } });
    await prisma.user.deleteMany({ where: { id: adminId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  describe('the ledger', () => {
    it('a credit and a debit move the balance, and the balance is always the SUM of the ledger', async () => {
      const id = await student();
      await credit(id, 50_000);
      await wallet.debit(adminId, id, {
        amountCents: 12_000,
        reducesIncome: false,
        note: 'تصحيح',
        idempotencyKey: randomUUID(),
      });

      expect(await balanceOf(id)).toBe(38_000);
      expect(await ledgerSum(id)).toBe(38_000);
      const rows = await prisma.walletTransaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'asc' } });
      expect(rows.map((row) => [row.kind, row.amountCents, row.balanceAfterCents])).toEqual([
        ['admin_credit', 50_000, 50_000],
        ['admin_debit', -12_000, 38_000],
      ]);
    });

    it('never goes below zero — the debit is refused and nothing is written', async () => {
      const id = await student();
      await credit(id, 10_000);

      await expect(
        wallet.debit(adminId, id, { amountCents: 10_001, reducesIncome: false, note: 'غلط', idempotencyKey: randomUUID() }),
      ).rejects.toBeInstanceOf(WalletInsufficientError);

      expect(await balanceOf(id)).toBe(10_000);
      expect(await prisma.walletTransaction.count({ where: { userId: id } })).toBe(1);
    });

    it('two debits racing for the same money: exactly one wins', async () => {
      const id = await student();
      await credit(id, 50_000);

      const results = await Promise.allSettled(
        [0, 1, 2].map(() =>
          prisma.$transaction((tx) => debitWallet(tx, { userId: id, kind: 'admin_debit', amountCents: 30_000 })),
        ),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected').every((r) => r.reason instanceof WalletInsufficientError)).toBe(true);
      expect(await balanceOf(id)).toBe(20_000);
      expect(await ledgerSum(id)).toBe(20_000);
    });

    it('the same «اشحن» pressed twice is ONE credit', async () => {
      const id = await student();
      const key = randomUUID();
      const input = { amountCents: 25_000, paid: true, note: null, idempotencyKey: key };

      await Promise.all([wallet.credit(adminId, id, input), wallet.credit(adminId, id, input)]);
      await wallet.credit(adminId, id, input);

      expect(await balanceOf(id)).toBe(25_000);
      expect(await prisma.walletTransaction.count({ where: { userId: id } })).toBe(1);
    });

    it('a ledger row cannot be rewritten or deleted, and the wallet cannot be emptied behind its back', async () => {
      const id = await student();
      await credit(id, 5_000);
      const row = await prisma.walletTransaction.findFirstOrThrow({ where: { userId: id } });

      await expect(
        prisma.walletTransaction.update({ where: { id: row.id }, data: { amountCents: 999_999 } }),
      ).rejects.toThrow(/append-only/);
      await expect(prisma.walletTransaction.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
      // A balance edited without its ledger row dies at COMMIT.
      await expect(
        prisma.wallet.update({ where: { userId: id }, data: { balanceCents: 1_000_000 } }),
      ).rejects.toThrow(/does not match its ledger/);
      await expect(prisma.wallet.delete({ where: { userId: id } })).rejects.toThrow(/only with its account/);

      expect(await balanceOf(id)).toBe(5_000);
    });

    it('a credit kind cannot be used to take money out, nor a debit kind to add it', async () => {
      const id = await student();
      await expect(
        prisma.$transaction((tx) => creditWallet(tx, { userId: id, kind: 'course_purchase', amountCents: 100 })),
      ).rejects.toThrow(/not a credit/);
      await expect(
        prisma.$transaction((tx) => debitWallet(tx, { userId: id, kind: 'admin_credit', amountCents: 100 })),
      ).rejects.toThrow(/not a debit/);
    });
  });

  describe('top-up requests', () => {
    const submit = (userId: string, amountCents = 20_000) =>
      wallet.submitTopup(userId, {
        method: 'instapay',
        amountCents,
        sender: 'someone@instapay',
        note: null,
        screenshotKey: 'payment-proof/wallet-spec.webp',
      });

    it('approving credits what ACTUALLY arrived, once — a second approval is refused', async () => {
      const id = await student();
      const request = await submit(id, 20_000);
      expect(await balanceOf(id)).toBe(0);

      const result = await wallet.approveTopup(adminId, request.id, { amountCents: 18_000 });
      expect(result.balanceCents).toBe(18_000);

      await expect(wallet.approveTopup(adminId, request.id, { amountCents: null })).rejects.toThrow(/already reviewed/);
      expect(await balanceOf(id)).toBe(18_000);
      const row = await prisma.walletTransaction.findFirstOrThrow({ where: { topupId: request.id } });
      expect(row).toMatchObject({ kind: 'transfer_topup', amountCents: 18_000, countsAsIncome: true });
      expect(
        await prisma.notification.count({ where: { userId: id, kind: 'wallet_credited' } }),
      ).toBe(1);
    });

    it('two admins approving the same request at the same moment credit it once', async () => {
      const id = await student();
      const request = await submit(id, 15_000);

      const results = await Promise.allSettled([
        wallet.approveTopup(adminId, request.id, { amountCents: null }),
        wallet.approveTopup(adminId, request.id, { amountCents: null }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await balanceOf(id)).toBe(15_000);
      expect(await prisma.walletTransaction.count({ where: { userId: id } })).toBe(1);
    });

    it('a rejection moves no money and tells the student why', async () => {
      const id = await student();
      const request = await submit(id);

      await wallet.rejectTopup(adminId, request.id, { reason: 'الصورة مش واضحة' });

      expect(await balanceOf(id)).toBe(0);
      const note = await prisma.notification.findFirstOrThrow({ where: { userId: id, kind: 'wallet_topup_rejected' } });
      expect(note.payload).toMatchObject({ topupId: request.id, reason: 'الصورة مش واضحة' });
    });

    it('refuses a screenshot that did not come from the payment upload', async () => {
      const id = await student();
      await expect(
        wallet.submitTopup(id, {
          method: 'vodafone_cash',
          amountCents: 10_000,
          sender: '01012345678',
          note: null,
          screenshotKey: 'covers/someone-else.webp',
        }),
      ).rejects.toThrow(/screenshotKey/);
    });
  });

  describe('wallet codes', () => {
    it('a code puts its amount in the wallet of whoever redeems it — once, for one student', async () => {
      const first = await student();
      const second = await student();
      const { codes: [code] } = await codes.create(adminId, {
        courseId: null,
        wholeCourse: false,
        items: [],
        quantity: 1,
        priceCents: null,
        walletCreditCents: 40_000,
        walletCreditPaid: false,
        note: null,
      });

      const redeemed = await codes.redeem(first, '127.0.0.1', code!.code);
      expect(redeemed).toMatchObject({ course: null, walletCreditCents: 40_000, walletBalanceCents: 40_000 });

      // The same student again: the success screen again, no second credit.
      await codes.redeem(first, '127.0.0.1', code!.code);
      expect(await balanceOf(first)).toBe(40_000);

      // Somebody else: used.
      await expect(codes.redeem(second, '127.0.0.1', code!.code)).rejects.toThrow();
      expect(await balanceOf(second)).toBe(0);

      // A gift code is money in the wallet and never income.
      const row = await prisma.walletTransaction.findFirstOrThrow({ where: { unlockCodeId: code!.id } });
      expect(row).toMatchObject({ kind: 'code_topup', countsAsIncome: false });

      // And a used wallet code is not pulled back by «اسحب».
      await expect(codes.revoke(adminId, code!.id)).rejects.toThrow();
    });
  });

  describe('paying for a course from the wallet', () => {
    it('refuses when the balance does not cover the price, says how much is there, and opens nothing', async () => {
      const id = await student();
      await credit(id, MONTHLY - 100);

      const error = await payments
        .purchaseFromWallet(id, { courseId, plan: 'monthly', termId: null, monthIds: [], idempotencyKey: randomUUID() })
        .catch((e: unknown) => e);

      expect(codeOf(error)).toBe('wallet_insufficient');
      expect((error as HttpException).getResponse()).toMatchObject({
        details: { balanceCents: MONTHLY - 100, requiredCents: MONTHLY },
      });
      expect(await prisma.accessGrant.count({ where: { userId: id } })).toBe(0);
      expect(await prisma.paymentSubmission.count({ where: { userId: id } })).toBe(0);
      expect(await balanceOf(id)).toBe(MONTHLY - 100);
    });

    it('grants exactly what an approved transfer grants, and charges once for a repeated press', async () => {
      const id = await student();
      await credit(id, MONTHLY + 5_000);
      const key = randomUUID();
      const input = { courseId, plan: 'monthly' as const, termId: null, monthIds: [], idempotencyKey: key };

      const [a, b] = await Promise.all([
        payments.purchaseFromWallet(id, input),
        payments.purchaseFromWallet(id, input),
      ]);

      expect(a.submission.id).toBe(b.submission.id);
      expect(await balanceOf(id)).toBe(5_000);

      const submission = await prisma.paymentSubmission.findUniqueOrThrow({
        where: { id: a.submission.id },
        include: { grant: true },
      });
      expect(submission).toMatchObject({ status: 'approved', isFree: false, amountCents: MONTHLY });
      expect(submission.walletTransactionId).not.toBeNull();
      expect(submission.grant).toMatchObject({ scope: 'course', source: 'purchase', revokedAt: null });
      expect(submission.grant?.validUntil?.getTime()).toBeGreaterThan(Date.now());
      const enrollment = await prisma.enrollment.findUniqueOrThrow({
        where: { userId_courseId: { userId: id, courseId } },
      });
      expect(enrollment).toMatchObject({ status: 'active', source: 'purchase' });
    });

    it('months: buys the chosen months, and the same month cannot be bought again', async () => {
      const id = await student();
      await credit(id, MONTH_PRICE * 3);

      await payments.purchaseFromWallet(id, {
        courseId: monthCourseId,
        plan: 'monthly',
        termId: null,
        monthIds: [monthOneId],
        idempotencyKey: randomUUID(),
      });

      const grants = await prisma.accessGrant.findMany({ where: { userId: id, courseId: monthCourseId } });
      expect(grants.map((grant) => [grant.scope, grant.monthId])).toEqual([['course_month', monthOneId]]);

      await expect(
        payments.purchaseFromWallet(id, {
          courseId: monthCourseId,
          plan: 'monthly',
          termId: null,
          monthIds: [monthOneId, monthTwoId],
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toThrow();
      expect(await balanceOf(id)).toBe(MONTH_PRICE * 2);
    });

    it('two different purchases racing for one balance: one subscription, one charge', async () => {
      const id = await student();
      await credit(id, MONTH_PRICE + 1_000);

      const results = await Promise.allSettled(
        [monthOneId, monthTwoId].map((monthId) =>
          payments.purchaseFromWallet(id, {
            courseId: monthCourseId,
            plan: 'monthly',
            termId: null,
            monthIds: [monthId],
            idempotencyKey: randomUUID(),
          }),
        ),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await balanceOf(id)).toBe(1_000);
      expect(await prisma.accessGrant.count({ where: { userId: id } })).toBe(1);
    });
  });

  describe('finance counts the money once', () => {
    it('a paid top-up is income on its day; spending it on a course is not income again', async () => {
      const id = await student();
      const before = await overview.overview();
      const dayBefore = await daily.daily({ days: 7, includeBooks: false });
      const listBefore = await finance.list({ page: 1, perPage: 10, sort: 'paid_desc' } as never);

      await credit(id, 50_000, true); // paid → income
      await credit(id, 7_000, false); // gift → not income
      await payments.purchaseFromWallet(id, {
        courseId,
        plan: 'monthly',
        termId: null,
        monthIds: [],
        idempotencyKey: randomUUID(),
      });

      const after = await overview.overview();
      expect(after.walletRevenueCents - before.walletRevenueCents).toBe(50_000);
      expect(after.subscriptionRevenueCents - before.subscriptionRevenueCents).toBe(0);
      expect(after.revenueTotalCents - before.revenueTotalCents).toBe(50_000);
      expect(after.walletSpentCents - before.walletSpentCents).toBe(MONTHLY);
      expect(after.walletBalanceCents - before.walletBalanceCents).toBe(57_000 - MONTHLY);

      const dayAfter = await daily.daily({ days: 7, includeBooks: false });
      expect(dayAfter.totals.walletCents - dayBefore.totals.walletCents).toBe(50_000);
      expect(dayAfter.totals.subscriptionCents - dayBefore.totals.subscriptionCents).toBe(0);
      expect(dayAfter.totals.walletPaidCount - dayBefore.totals.walletPaidCount).toBe(1);
      expect(dayAfter.totals.netCents - dayBefore.totals.netCents).toBe(50_000);

      const listAfter = await finance.list({ page: 1, perPage: 10, sort: 'paid_desc' } as never);
      expect(listAfter.summary.revenueTotalCents).toBe(listBefore.summary.revenueTotalCents);

      const mine = await daily.forStudent(id);
      expect(mine.totals).toMatchObject({ paidCents: 0, walletPaidCents: MONTHLY });
      expect(mine.rows[0]?.via).toBe('wallet');
    });

    it('a wallet-paid subscription refunds INTO the wallet — no cash refund row, no revenue change', async () => {
      const id = await student();
      await credit(id, MONTHLY);
      const { submission } = await payments.purchaseFromWallet(id, {
        courseId,
        plan: 'monthly',
        termId: null,
        monthIds: [],
        idempotencyKey: randomUUID(),
      });
      const grantId = (await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: submission.id } })).grantId!;
      const before = await overview.overview();

      const row = await finance.cancel(adminId, grantId, {
        reason: 'استرجاع',
        showToStudent: false,
        refundCents: 10_000,
      });

      expect(row.refundedCents).toBe(10_000);
      expect(await balanceOf(id)).toBe(10_000);
      expect(await prisma.refund.count({ where: { submissionId: submission.id } })).toBe(0);
      const refundRow = await prisma.walletTransaction.findFirstOrThrow({
        where: { userId: id, kind: 'refund' },
      });
      expect(refundRow).toMatchObject({ amountCents: 10_000, refundOfSubmissionId: submission.id, countsAsIncome: false });

      const after = await overview.overview();
      expect(after.revenueTotalCents).toBe(before.revenueTotalCents);
      expect(after.refundsTotalCents).toBe(before.refundsTotalCents);

      // And never more back than it took out.
      await expect(
        finance.cancel(adminId, grantId, { reason: 'تاني', showToStudent: false, refundCents: MONTHLY }),
      ).rejects.toThrow();
    });

    it('the amount of a wallet purchase cannot be edited on the money screen', async () => {
      const id = await student();
      await credit(id, MONTHLY);
      const { submission } = await payments.purchaseFromWallet(id, {
        courseId,
        plan: 'monthly',
        termId: null,
        monthIds: [],
        idempotencyKey: randomUUID(),
      });
      const grantId = (await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: submission.id } })).grantId!;

      await expect(finance.editAmount(adminId, grantId, { amountCents: 0, isFree: true })).rejects.toThrow(
        /المحفظة/,
      );
    });
  });
});
