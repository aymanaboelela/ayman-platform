// Prisma 7 does not auto-load .env, and this spec runs outside Nest's bootstrap.
import 'dotenv/config';
import { randomInt } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AcquisitionClaimSchema, type AcquisitionClaim } from '@ayman/contracts/acquisition';
import {
  ACQUISITION_CLAIM_WINDOW_SECONDS,
  ACQUISITION_TOUCH_TTL_SECONDS,
} from '@ayman/contracts/acquisition-touch';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { creditWallet, debitWallet } from '../wallet/wallet-ledger';
import { AcquisitionService } from './acquisition.service';

/**
 * «الحساب ده جه منين», against the real database — because both halves are
 * database promises. The write: one first touch per account however many
 * requests race, and none at all for an account that was already here. The
 * report: «دفع» and «الإيراد» are SQL over three money tables, and every way
 * they can be wrong is about which rows count.
 *
 * Every assertion reads the ROW (or the report built from rows), never the
 * outcome string alone — a refusal that still wrote something would return
 * the right word.
 *
 * Fixture ids are not UUIDs on purpose: a real account's id is a better-auth
 * nanoid, and a column or cast that only fits a UUID passes every hand-made
 * fixture and fails every student.
 *
 * The report's fixtures are created on a calendar day decades in the past and
 * the report is asked for that day alone, so its TOTALS can be asserted on a
 * shared database that holds other people's rows.
 */
describe('AcquisitionService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new AcquisitionService(prisma);

  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const prefix = `acq_${stamp}_`;
  let seq = 0;

  async function account(createdAt: Date): Promise<string> {
    seq += 1;
    const id = `${prefix}${seq}`;
    await prisma.user.create({
      data: { id, name: `حساب ${seq}`, email: `${id}@t.test`, createdAt },
    });
    return id;
  }

  /** A body as the browser sends it, through the same schema the route applies. */
  function touch(over: Record<string, unknown> = {}): AcquisitionClaim {
    return AcquisitionClaimSchema.parse({
      source: 'facebook',
      medium: 'paid',
      campaign: `${stamp}-reel`,
      content: null,
      term: null,
      fbclid: null,
      landingPath: '/courses/y2',
      ageSeconds: 300,
      ...over,
    });
  }

  const rowOf = (userId: string) => prisma.userAcquisition.findUnique({ where: { userId } });

  const NOW = new Date('2026-11-18T12:00:00.000Z');
  const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    // The users' cascade is the one way their ledger rows may leave.
    await prisma.user.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.$disconnect();
  });

  describe('claim', () => {
    it('writes the first touch of an account that was just created', async () => {
      const userId = await account(ago(20));

      const outcome = await service.claim(
        userId,
        touch({ source: ' Facebook ', content: 'video-a', fbclid: 'IwAR0abc', ageSeconds: 300 }),
        NOW,
      );

      expect(outcome).toBe('recorded');
      expect(await rowOf(userId)).toMatchObject({
        source: 'facebook',
        medium: 'paid',
        campaign: `${stamp}-reel`,
        content: 'video-a',
        term: null,
        fbclid: 'IwAR0abc',
        landingPath: '/courses/y2',
        // Placed on the server's clock from the age, not taken from the body.
        firstTouchAt: ago(300),
      });
    });

    it('is a no-op the second time — the first touch stays the first', async () => {
      const userId = await account(ago(20));
      await service.claim(userId, touch({ campaign: `${stamp}-first` }), NOW);

      const again = await service.claim(userId, touch({ campaign: `${stamp}-second`, source: 'tiktok' }), NOW);

      expect(again).toBe('exists');
      expect(await rowOf(userId)).toMatchObject({ source: 'facebook', campaign: `${stamp}-first` });
      expect(await prisma.userAcquisition.count({ where: { userId } })).toBe(1);
    });

    it('lets exactly one of two racing claims write', async () => {
      const userId = await account(ago(20));

      const outcomes = await Promise.all([
        service.claim(userId, touch({ campaign: `${stamp}-tab-a` }), NOW),
        service.claim(userId, touch({ campaign: `${stamp}-tab-b` }), NOW),
      ]);

      expect([...outcomes].sort()).toEqual(['exists', 'recorded']);
      expect(await prisma.userAcquisition.count({ where: { userId } })).toBe(1);
    });

    it('refuses an account older than the claim window, and writes nothing', async () => {
      const userId = await account(ago(ACQUISITION_CLAIM_WINDOW_SECONDS + 60));

      // A touch from before the account existed — only the account's age is wrong.
      const outcome = await service.claim(
        userId,
        touch({ ageSeconds: ACQUISITION_CLAIM_WINDOW_SECONDS + 600 }),
        NOW,
      );

      expect(outcome).toBe('account_too_old');
      expect(await rowOf(userId)).toBeNull();
    });

    it('still accepts an account near the end of the window — the retry after a lost request', async () => {
      const userId = await account(ago(ACQUISITION_CLAIM_WINDOW_SECONDS - 60));

      const outcome = await service.claim(
        userId,
        touch({ ageSeconds: ACQUISITION_CLAIM_WINDOW_SECONDS + 600 }),
        NOW,
      );

      expect(outcome).toBe('recorded');
      expect(await rowOf(userId)).not.toBeNull();
    });

    it('refuses an ad link opened AFTER the account was made', async () => {
      // Signed up two hours ago with no ad involved, clicked one ten minutes ago.
      const userId = await account(ago(2 * 60 * 60));

      const outcome = await service.claim(userId, touch({ ageSeconds: 600 }), NOW);

      expect(outcome).toBe('touch_after_signup');
      expect(await rowOf(userId)).toBeNull();
    });

    it('allows for the request’s own travel time on a sign-up made seconds after landing', async () => {
      // One tap on Google from the ad's landing page: the account is 30s old
      // and the age the browser reports puts the touch a few seconds "after" it.
      const userId = await account(ago(30));

      const outcome = await service.claim(userId, touch({ ageSeconds: 25 }), NOW);

      expect(outcome).toBe('recorded');
    });

    it('refuses a touch older than the browser was allowed to keep it', async () => {
      const userId = await account(ago(20));

      const outcome = await service.claim(
        userId,
        touch({ ageSeconds: ACQUISITION_TOUCH_TTL_SECONDS + 1 }),
        NOW,
      );

      expect(outcome).toBe('touch_expired');
      expect(await rowOf(userId)).toBeNull();
    });

    it('answers 404 for a session whose account is gone', async () => {
      await expect(service.claim(`${prefix}nobody`, touch(), NOW)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('report', () => {
    /** Noon UTC on a day nobody else's rows live on — 14:00 or 15:00 in Cairo, the same date. */
    const dayIndex = randomInt(0, 3000);
    const dayAt = (offsetDays: number, time = '12:00:00') => {
      const date = new Date(`2001-01-01T${time}Z`);
      date.setUTCDate(date.getUTCDate() + dayIndex + offsetDays);
      return date;
    };
    const DAY = dayAt(0).toISOString().slice(0, 10);

    const A = `${stamp}-a`;
    const B = `${stamp}-b`;
    let courseId = '';
    let instructorId = '';

    /** An account created at `createdAt`, attributed through the real write path. */
    async function attributed(createdAt: Date, over: Record<string, unknown>): Promise<string> {
      const userId = await account(createdAt);
      const outcome = await service.claim(userId, touch(over), new Date(createdAt.getTime() + 60_000));
      expect(outcome).toBe('recorded');
      return userId;
    }

    function submission(
      userId: string,
      over: { status?: 'approved' | 'pending'; isFree?: boolean; walletTransactionId?: string } = {},
    ) {
      const status = over.status ?? 'approved';
      return prisma.paymentSubmission.create({
        data: {
          userId,
          courseId,
          plan: 'monthly',
          amountCents: 30_000,
          isFree: over.isFree ?? false,
          senderPhone: over.walletTransactionId ? null : '01000000000',
          status,
          reviewedAt: status === 'approved' ? new Date() : null,
          walletTransactionId: over.walletTransactionId ?? null,
        },
        select: { id: true },
      });
    }

    /** Puts `cents` in the wallet — paid for or a gift — and spends 300 EGP of it on the course. */
    async function walletPurchase(userId: string, cents: number, countsAsIncome: boolean): Promise<void> {
      const debit = await prisma.$transaction(async (tx) => {
        await creditWallet(tx, { userId, kind: 'admin_credit', amountCents: cents, countsAsIncome });
        return debitWallet(tx, { userId, kind: 'course_purchase', amountCents: 30_000 });
      });
      await submission(userId, { walletTransactionId: debit.id });
    }

    beforeAll(async () => {
      instructorId = (
        await prisma.user.create({
          data: { id: `${prefix}instructor`, name: 'أدمن', email: `${prefix}instructor@t.test`, role: 'admin' },
        })
      ).id;
      const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
      const subject = await prisma.subject.findFirstOrThrow();
      courseId = (
        await prisma.course.create({
          data: {
            status: 'draft',
            systemId: system.id,
            subjectId: subject.id,
            year: 2,
            instructorId,
            requiresGrant: true,
            slug: `${prefix}course`,
            title: `كورس ${stamp}`,
            monthlyPriceCents: 30_000,
          },
        })
      ).id;

      // ── campaign A: three sign-ups, two of them paid, 800 EGP came in ──
      await submission(await attributed(dayAt(0), { campaign: A })); //            transfer: 300
      await attributed(dayAt(0), { campaign: A }); //                              never paid
      await walletPurchase(await attributed(dayAt(0), { campaign: A }), 50_000, true); // topped up 500, spent 300

      // ── campaign B: three sign-ups, one "paid" with a gift, nothing came in ──
      await submission(await attributed(dayAt(0), { campaign: B }), { isFree: true }); //     comped
      await submission(await attributed(dayAt(0), { campaign: B }), { status: 'pending' }); // not approved
      await walletPurchase(await attributed(dayAt(0), { campaign: B }), 30_000, false); //     gifted credit

      // ── a click that carried only fbclid ──
      await attributed(dayAt(0), { source: null, medium: null, campaign: null, fbclid: `IwAR${stamp}` });

      // ── 23:30 UTC the evening before is already this day in Cairo ──
      await attributed(dayAt(-1, '23:30:00'), { campaign: A, medium: 'story' });

      // ── outside the window: campaign A, two days earlier, and it paid ──
      await submission(await attributed(dayAt(-2), { campaign: A }));

      // ── a paying account that came through no ad link at all ──
      await submission(await account(dayAt(0)));
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: { startsWith: prefix }, role: 'student' } });
      await prisma.course.deleteMany({ where: { id: courseId } });
    });

    it('counts a paying and a non-paying attributed account, and only the money that arrived', async () => {
      const report = await service.report({ from: DAY, to: DAY });

      expect(report.rows.find((row) => row.campaign === A && row.medium === 'paid')).toEqual({
        source: 'facebook',
        medium: 'paid',
        campaign: A,
        signups: 3,
        paid: 2,
        // 300 by transfer + the 500 top-up. NOT 1,100: the 300 spent from the
        // wallet is the same money as the top-up it came out of.
        revenueCents: 80_000,
      });
    });

    it('does not count a comped, a pending or a gift-funded subscription as money', async () => {
      const report = await service.report({ from: DAY, to: DAY });

      expect(report.rows.find((row) => row.campaign === B)).toEqual({
        source: 'facebook',
        medium: 'paid',
        campaign: B,
        signups: 3,
        // The gift-funded one IS a paid subscription, the way the finance
        // screen counts it — and brought in nothing.
        paid: 1,
        revenueCents: 0,
      });
    });

    it('reports a click that carried only fbclid under facebook, with no medium claimed', async () => {
      const report = await service.report({ from: DAY, to: DAY });

      expect(report.rows.find((row) => row.campaign === null)).toEqual({
        source: 'facebook',
        medium: null,
        campaign: null,
        signups: 1,
        paid: 0,
        revenueCents: 0,
      });
    });

    it('buckets an account by its CAIRO day, and keeps a different medium on its own row', async () => {
      const report = await service.report({ from: DAY, to: DAY });

      expect(report.rows.find((row) => row.campaign === A && row.medium === 'story')).toMatchObject({
        signups: 1,
        paid: 0,
      });
    });

    it('totals every campaign in the window and nothing outside it', async () => {
      const report = await service.report({ from: DAY, to: DAY });

      // No unattributed account, and not the one from two days earlier.
      expect(report.totals).toEqual({ campaigns: 4, signups: 8, paid: 3, revenueCents: 80_000 });
      expect(report.rows).toHaveLength(4);
      expect(report.rows.map((row) => row.signups)).toEqual([3, 3, 1, 1]);
    });

    it('widens with the window', async () => {
      const earlier = dayAt(-2).toISOString().slice(0, 10);
      const report = await service.report({ from: earlier, to: DAY });

      expect(report.rows.find((row) => row.campaign === A && row.medium === 'paid')).toMatchObject({
        signups: 4,
        paid: 3,
        revenueCents: 110_000,
      });
    });

    it('answers an empty window with zeroes, not an error', async () => {
      const report = await service.report({ from: '1990-01-01', to: '1990-01-01' });

      expect(report).toEqual({
        from: '1990-01-01',
        to: '1990-01-01',
        rows: [],
        totals: { campaigns: 0, signups: 0, paid: 0, revenueCents: 0 },
      });
    });
  });
});
