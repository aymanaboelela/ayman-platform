// Prisma 7 does not auto-load .env, and this spec runs outside Nest's bootstrap.
import 'dotenv/config';
import { randomInt } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { encodeReferralCookie } from '@ayman/contracts/referrals';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { creditWallet, debitWallet } from '../wallet/wallet-ledger';
import { attributeSignup } from './referral-attribution';
import { ReferralsService } from './referrals.service';

/**
 * «دعوة الصحاب», against the real database — because every promise here is a
 * database promise: one reward per friend however many sweeps race, no reward
 * for money that never arrived, the reward coming back with a refund, and an
 * account attributed once and never again.
 *
 * Fixture ids carry a per-run stamp; cleanup deletes the USERS (their cascade
 * is the one way ledger rows may leave), never ledger or audit rows.
 */

describe('referrals', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const audit = new AuditService(prisma);
  const notifications = new NotificationsService(prisma);
  const referrals = new ReferralsService(prisma, audit, notifications);

  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let courseId = '';
  let governorateCode = '';
  let adminId = '';
  let savedProgram: unknown = null;

  const REFERRER = 5_100;
  const FRIEND = 2_300;

  const phone = () => `+2010${String(randomInt(10_000_000, 99_999_999))}`;

  let seq = 0;
  async function student(over: { phone?: string; father?: string | null } = {}): Promise<string> {
    seq += 1;
    const id = `ref-stu-${stamp}-${seq}`;
    const own = over.phone ?? phone();
    await prisma.user.create({ data: { id, name: `طالب ${seq}`, email: `${id}@t.test`, phoneNumber: own } });
    await prisma.studentProfile.create({
      data: {
        userId: id,
        fullName: `طالب ${seq}`,
        gender: 'female',
        phone: own,
        fatherPhone: over.father === undefined ? phone() : over.father,
        governorateCode,
        year: 2,
      },
    });
    return id;
  }

  async function approvedPayment(userId: string, over: { isFree?: boolean; walletTransactionId?: string } = {}) {
    return prisma.paymentSubmission.create({
      data: {
        userId,
        courseId,
        plan: 'monthly',
        amountCents: 30_000,
        isFree: over.isFree ?? false,
        senderPhone: over.walletTransactionId ? null : '01000000000',
        status: 'approved',
        reviewedAt: new Date(),
        walletTransactionId: over.walletTransactionId ?? null,
      },
      select: { id: true },
    });
  }

  async function referral(referrerId: string, friendId: string): Promise<string> {
    const code = await referrals.codeFor(referrerId);
    const outcome = await attributeSignup(prisma, {
      userId: friendId,
      cookieHeader: `__Host-ref=${encodeReferralCookie(code, new Date())}`,
    });
    expect(outcome).toBe('attributed');
    return (await prisma.referral.findUniqueOrThrow({ where: { referredUserId: friendId } })).id;
  }

  const balanceOf = async (userId: string) =>
    (await prisma.wallet.findUnique({ where: { userId } }))?.balanceCents ?? 0;

  async function setProgram(over: Partial<{ enabled: boolean; monthlyCap: number; windowDays: number }> = {}) {
    await prisma.referralProgram.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        enabled: true,
        referrerRewardCents: REFERRER,
        friendRewardCents: FRIEND,
        monthlyCap: 50,
        windowDays: 30,
        whatsappNotice: false,
        ...over,
      },
      update: {
        enabled: true,
        referrerRewardCents: REFERRER,
        friendRewardCents: FRIEND,
        monthlyCap: 50,
        windowDays: 30,
        whatsappNotice: false,
        ...over,
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    savedProgram = await prisma.referralProgram.findUnique({ where: { id: 1 } });
    adminId = (
      await prisma.user.create({
        data: { id: `ref-admin-${stamp}`, name: 'أدمن', email: `ref-admin-${stamp}@t.test`, role: 'admin' },
      })
    ).id;
    governorateCode = (await prisma.governorate.findFirstOrThrow()).code;
    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    courseId = (
      await prisma.course.create({
        data: {
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 2,
          instructorId: adminId,
          requiresGrant: true,
          slug: `ref-course-${stamp}`,
          title: 'كورس الدعوة',
          monthlyPriceCents: 30_000,
        },
      })
    ).id;
  });

  beforeEach(async () => {
    await setProgram();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { startsWith: `ref-stu-${stamp}` } } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: adminId } }).catch(() => undefined);
    if (savedProgram) {
      const { id: _id, updatedAt: _at, ...rest } = savedProgram as Record<string, unknown>;
      await prisma.referralProgram.update({ where: { id: 1 }, data: rest as never });
    } else {
      await prisma.referralProgram.deleteMany({ where: { id: 1 } });
    }
    await prisma.$disconnect();
  });

  describe('attribution', () => {
    it('a sign-up through a link is attributed to its owner', async () => {
      const referrer = await student();
      const friend = await student();
      const id = await referral(referrer, friend);
      const row = await prisma.referral.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ referrerUserId: referrer, status: 'joined' });
    });

    it('never re-attributes an account that is already attributed', async () => {
      const first = await student();
      const second = await student();
      const friend = await student();
      await referral(first, friend);
      const otherCode = await referrals.codeFor(second);
      const again = await attributeSignup(prisma, {
        userId: friend,
        cookieHeader: `__Host-ref=${encodeReferralCookie(otherCode, new Date())}`,
      });
      expect(again).toBe('already');
      const row = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: friend } });
      expect(row.referrerUserId).toBe(first);
    });

    it('ignores a click outside the window, an own code, an unknown code and a switched-off program', async () => {
      const referrer = await student();
      const code = await referrals.codeFor(referrer);
      const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      const cookie = (at: Date, c = code) => `__Host-ref=${encodeReferralCookie(c, at)}`;

      expect(await attributeSignup(prisma, { userId: await student(), cookieHeader: cookie(old) })).toBe('expired');
      expect(await attributeSignup(prisma, { userId: referrer, cookieHeader: cookie(new Date()) })).toBe('self');
      expect(
        await attributeSignup(prisma, { userId: await student(), cookieHeader: cookie(new Date(), 'ZZZZZZ') }),
      ).toBe('unknown-code');
      await setProgram({ enabled: false });
      expect(await attributeSignup(prisma, { userId: await student(), cookieHeader: cookie(new Date()) })).toBe(
        'program-off',
      );
    });

    it('a student keeps one stable code', async () => {
      const id = await student();
      const [a, b] = await Promise.all([referrals.codeFor(id), referrals.codeFor(id)]);
      expect(a).toBe(b);
      expect(await referrals.codeFor(id)).toBe(a);
    });
  });

  describe('the reward', () => {
    it('waits for a real payment, then credits both wallets once', async () => {
      const referrer = await student();
      const friend = await student();
      const id = await referral(referrer, friend);

      expect(await referrals.reward(id)).toBe('waiting');
      await approvedPayment(friend);
      expect(await referrals.reward(id)).toBe('credited');

      expect(await balanceOf(referrer)).toBe(REFERRER);
      expect(await balanceOf(friend)).toBe(FRIEND);
      const rows = await prisma.walletTransaction.findMany({ where: { referralId: id } });
      expect(rows.map((row) => [row.kind, row.amountCents, row.countsAsIncome]).sort()).toEqual(
        [
          ['referral_reward', FRIEND, false],
          ['referral_reward', REFERRER, false],
        ].sort(),
      );

      // Again, and again at once: nothing more moves.
      expect(await referrals.reward(id)).toBe('skipped');
      expect(await balanceOf(referrer)).toBe(REFERRER);
    });

    it('two sweeps racing on the same referral pay it once', async () => {
      const referrer = await student();
      const friend = await student();
      const id = await referral(referrer, friend);
      await approvedPayment(friend);

      const outcomes = await Promise.all([referrals.reward(id), referrals.reward(id), referrals.reward(id)]);
      expect(outcomes.filter((outcome) => outcome === 'credited')).toHaveLength(1);
      expect(await balanceOf(referrer)).toBe(REFERRER);
      expect(await balanceOf(friend)).toBe(FRIEND);
      expect(await prisma.walletTransaction.count({ where: { referralId: id } })).toBe(2);
    });

    it('the ledger itself refuses a second reward row for the same person', async () => {
      const referrer = await student();
      const friend = await student();
      const id = await referral(referrer, friend);
      await approvedPayment(friend);
      await referrals.reward(id);

      await expect(
        prisma.$transaction((tx) =>
          creditWallet(tx, { userId: referrer, kind: 'referral_reward', amountCents: 100, referralId: id }),
        ),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('a comped term or a refunded payment is not a real payment', async () => {
      const referrer = await student();
      const friend = await student();
      const id = await referral(referrer, friend);

      await approvedPayment(friend, { isFree: true });
      expect(await referrals.reward(id)).toBe('waiting');

      const paid = await approvedPayment(friend);
      await prisma.refund.create({
        data: { submissionId: paid.id, amountCents: 30_000, reasonAr: 'تجربة', occurredOn: new Date() },
      });
      expect(await referrals.reward(id)).toBe('waiting');
      expect(await balanceOf(referrer)).toBe(0);
    });

    it('a course bought with gift money does not count; one bought with real money does', async () => {
      const referrer = await student();
      const friend = await student();
      const id = await referral(referrer, friend);

      // A gift (not income) pays for the first course from the wallet.
      const gift = await prisma.$transaction(async (tx) => {
        await creditWallet(tx, { userId: friend, kind: 'admin_credit', amountCents: 30_000, countsAsIncome: false });
        return debitWallet(tx, { userId: friend, kind: 'course_purchase', amountCents: 30_000 });
      });
      await approvedPayment(friend, { walletTransactionId: gift.id });
      expect(await referrals.reward(id)).toBe('waiting');

      // Real money in, and a second course from it: income (30k) no longer
      // covers everything spent (60k), so the wallet path still says no …
      const second = await prisma.$transaction(async (tx) => {
        await creditWallet(tx, { userId: friend, kind: 'admin_credit', amountCents: 30_000, countsAsIncome: true });
        return debitWallet(tx, { userId: friend, kind: 'course_purchase', amountCents: 30_000 });
      });
      await approvedPayment(friend, { walletTransactionId: second.id });
      expect(await referrals.reward(id)).toBe('waiting');

      // … and a transfer paid straight in is real by construction.
      await approvedPayment(friend);
      expect(await referrals.reward(id)).toBe('credited');
    });

    it('a friend paid for from a referral reward cannot trigger a reward of their own', async () => {
      const a = await student();
      const b = await student();
      const c = await student();
      const ab = await referral(a, b);
      const bc = await referral(b, c);

      await approvedPayment(c);
      expect(await referrals.reward(bc)).toBe('credited');
      expect(await balanceOf(b)).toBe(REFERRER);

      // B spends the reward on a course from the wallet.
      const debit = await prisma.$transaction((tx) =>
        debitWallet(tx, { userId: b, kind: 'course_purchase', amountCents: REFERRER }),
      );
      await approvedPayment(b, { walletTransactionId: debit.id });
      expect(await referrals.reward(ab)).toBe('waiting');
      expect(await balanceOf(a)).toBe(0);
    });
  });

  describe('the abuse rules', () => {
    it('refuses the same phone on both sides, and moves no money', async () => {
      const shared = phone();
      const referrer = await student({ phone: shared });
      const friend = await student();
      const id = await referral(referrer, friend);
      // The friend's PROFILE phone is the referrer's — a second account.
      await prisma.user.update({ where: { id: friend }, data: { phoneNumber: null } });
      await prisma.studentProfile.update({ where: { userId: referrer }, data: { phone: phone() } });
      await prisma.studentProfile.update({ where: { userId: friend }, data: { phone: shared } });
      await approvedPayment(friend);

      expect(await referrals.reward(id)).toBe('blocked');
      const row = await prisma.referral.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ status: 'blocked', blockReason: 'same_phone' });
      expect(await balanceOf(referrer)).toBe(0);
      expect(await balanceOf(friend)).toBe(0);
    });

    it('refuses the same parent behind both students', async () => {
      const parent = phone();
      const referrer = await student({ father: parent });
      const friend = await student({ father: parent });
      const id = await referral(referrer, friend);
      await approvedPayment(friend);

      expect(await referrals.reward(id)).toBe('blocked');
      expect((await prisma.referral.findUniqueOrThrow({ where: { id } })).blockReason).toBe('guardian_phone');
    });

    it('stops at the monthly cap', async () => {
      await setProgram({ monthlyCap: 2 });
      const referrer = await student();
      const outcomes: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        const friend = await student();
        const id = await referral(referrer, friend);
        await approvedPayment(friend);
        outcomes.push(await referrals.reward(id));
      }
      expect(outcomes).toEqual(['credited', 'credited', 'blocked']);
      expect(await balanceOf(referrer)).toBe(REFERRER * 2);
    });
  });

  describe('taking it back', () => {
    it('a refund of the triggering payment reverses both rewards', async () => {
      const referrer = await student();
      const friend = await student();
      const id = await referral(referrer, friend);
      const paid = await approvedPayment(friend);
      await referrals.reward(id);

      expect(await referrals.refundedCandidates(100)).not.toContain(id);
      await prisma.refund.create({
        data: { submissionId: paid.id, amountCents: 10_000, reasonAr: 'مرتجع', occurredOn: new Date() },
      });
      expect(await referrals.refundedCandidates(100)).toContain(id);
      expect(await referrals.reverseForRefund(id)).toBe(true);
      expect(await referrals.reverseForRefund(id)).toBe(false);

      expect(await balanceOf(referrer)).toBe(0);
      expect(await balanceOf(friend)).toBe(0);
      const row = await prisma.referral.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ status: 'reversed', reversedCents: REFERRER + FRIEND });
    });

    it('never takes a wallet below zero — what was spent stays spent', async () => {
      const referrer = await student();
      const friend = await student();
      const id = await referral(referrer, friend);
      const paid = await approvedPayment(friend);
      await referrals.reward(id);
      // The referrer already spent most of it.
      await prisma.$transaction((tx) =>
        debitWallet(tx, { userId: referrer, kind: 'admin_debit', amountCents: REFERRER - 1_000 }),
      );

      await prisma.refund.create({
        data: { submissionId: paid.id, amountCents: 30_000, reasonAr: 'مرتجع', occurredOn: new Date() },
      });
      await referrals.reverseForRefund(id);
      expect(await balanceOf(referrer)).toBe(0);
      expect((await prisma.referral.findUniqueOrThrow({ where: { id } })).reversedCents).toBe(1_000 + FRIEND);
    });

    it('an admin void takes a credited reward back, and is final', async () => {
      const referrer = await student();
      const friend = await student();
      const id = await referral(referrer, friend);
      await approvedPayment(friend);
      await referrals.reward(id);

      const row = await referrals.void(adminId, id, { reason: 'نفس الطالب بحسابين' });
      expect(row.status).toBe('voided');
      expect(await balanceOf(referrer)).toBe(0);
      expect(await balanceOf(friend)).toBe(0);
      await expect(referrals.void(adminId, id, { reason: 'تاني' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('voiding a joined referral closes it before any money moves', async () => {
      const referrer = await student();
      const friend = await student();
      const id = await referral(referrer, friend);
      await referrals.void(adminId, id, { reason: 'مش طالب حقيقي' });
      await approvedPayment(friend);
      expect(await referrals.reward(id)).toBe('skipped');
      expect(await balanceOf(referrer)).toBe(0);
    });
  });

  describe("the student's page", () => {
    it('counts sign-ups, payments and rewards, and names friends by first name only', async () => {
      const referrer = await student();
      const paying = await student();
      const waiting = await student();
      const paidId = await referral(referrer, paying);
      await referral(referrer, waiting);
      await approvedPayment(paying);
      await referrals.reward(paidId);

      const mine = await referrals.mine(referrer);
      expect(mine.counts).toEqual({ joined: 2, paid: 1, credited: 1 });
      expect(mine.earnedCents).toBe(REFERRER);
      expect(mine.friends.map((friend) => friend.status).sort()).toEqual(['credited', 'joined']);
      expect(mine.friends.every((friend) => !friend.firstName.includes(' '))).toBe(true);
    });
  });
});
