import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { MyReferrals } from '@ayman/contracts/referrals';
import type {
  AdminReferralList,
  AdminReferralQuery,
  AdminReferralRow,
  ReferralProgram,
  TopReferrer,
  VoidReferralInput,
} from '@ayman/contracts/admin/referrals';
import { firstNameOf } from '@ayman/contracts/outreach/compose';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { isUniqueViolation } from '../../common/prisma/prisma-errors';
import type { Prisma, ReferralStatus } from '../../generated/prisma/client';
import { creditWallet, debitWallet } from '../wallet/wallet-ledger';
import { readReferralProgram } from './referral-attribution';
import {
  cairoMonthStart,
  friendStatusOf,
  generateReferralCode,
  realMoneyCovers,
  referralAbuse,
  reversalTake,
  type PersonPhones,
} from './referral-rules';

/** «صحابك» on the student page — enough for a real student, bounded for a script. */
const FRIENDS_LIMIT = 50;
const TOP_LIMIT = 10;
/** How many of a friend's approved payments are looked at for the first real one. */
const TRIGGER_SCAN = 10;

export type RewardOutcome = 'credited' | 'blocked' | 'waiting' | 'skipped';

const PERSON_SELECT = {
  id: true,
  name: true,
  phoneNumber: true,
  bannedAt: true,
  studentProfile: { select: { phone: true, fatherPhone: true, motherPhone: true } },
} as const satisfies Prisma.UserSelect;

type PersonRecord = Prisma.UserGetPayload<{ select: typeof PERSON_SELECT }>;

function phonesOf(person: PersonRecord): PersonPhones {
  return {
    userId: person.id,
    bannedAt: person.bannedAt,
    own: [person.phoneNumber, person.studentProfile?.phone],
    guardian: [person.studentProfile?.fatherPhone, person.studentProfile?.motherPhone],
  };
}

/**
 * «دعوة الصحاب» — the program's money and its screens.
 *
 * ## Where money moves, and where it does not
 *
 * Attribution (`referral-attribution.ts`, at sign-up) moves nothing. The
 * reward moves money exactly once, in `reward()`: one transaction holding the
 * referral's `joined → credited` UPDATE, both `referral_reward` ledger rows,
 * both notifications and the audit row. The reversal is the mirror image, in
 * `takeBack()`. Both go through `wallet-ledger.ts` and nothing else.
 *
 * ## Why the reward is swept and not hooked onto each approval
 *
 * Four code paths approve a payment (the desk, InstaPay auto-approval, an
 * admin recording one by hand, a wallet purchase), and a fifth will come.
 * Hooking each one would put a bonus on the path of somebody's subscription —
 * a referral bug would then fail a real payment — and would miss the next
 * path silently. `ReferralSweeper` instead asks, every minute, «which joined
 * friend has a real approved payment now?», which covers every door that
 * exists and every one added later, and survives a crash between the
 * approval and the reward because it simply asks again.
 */
@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /* ── student ─────────────────────────────────────────────────────────── */

  /**
   * The student's code, minted on first use. A race between two tabs is the
   * `user_id` primary key's to settle; a collision between two students'
   * random codes is the `code` UNIQUE's — either way the loser reads back.
   */
  async codeFor(userId: string): Promise<string> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const existing = await this.prisma.referralCode.findUnique({ where: { userId }, select: { code: true } });
      if (existing) return existing.code;
      try {
        const created = await this.prisma.referralCode.create({
          data: { userId, code: generateReferralCode() },
          select: { code: true },
        });
        return created.code;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new ConflictException('could not mint a referral code');
  }

  async mine(userId: string): Promise<MyReferrals> {
    const [code, program, rows, earned] = await Promise.all([
      this.codeFor(userId),
      readReferralProgram(this.prisma),
      this.prisma.referral.findMany({
        where: { referrerUserId: userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          status: true,
          triggerSubmissionId: true,
          createdAt: true,
          referred: { select: { name: true } },
        },
      }),
      this.prisma.referral.aggregate({
        where: { referrerUserId: userId, status: 'credited' },
        _sum: { referrerRewardCents: true },
      }),
    ]);

    const counted = rows.filter((row) => row.status !== 'voided');
    return {
      active: program.enabled,
      code,
      referrerRewardCents: program.referrerRewardCents,
      friendRewardCents: program.friendRewardCents,
      windowDays: program.windowDays,
      counts: {
        joined: counted.length,
        paid: counted.filter((row) => row.triggerSubmissionId !== null).length,
        credited: counted.filter((row) => row.status === 'credited').length,
      },
      earnedCents: earned._sum.referrerRewardCents ?? 0,
      friends: rows.slice(0, FRIENDS_LIMIT).map((row) => ({
        firstName: firstNameOf(row.referred.name),
        status: friendStatusOf(row.status),
        joinedAt: row.createdAt.toISOString(),
      })),
    };
  }

  /* ── the reward ──────────────────────────────────────────────────────── */

  /**
   * The friend's first REAL payment, or `null` if there is none yet.
   *
   * Real means: approved, not comped (`isFree`), not zero, never refunded,
   * and — when it was paid from the wallet — paid with money that came in as
   * income (`realMoneyCovers`). Admin grants and unlock codes never create a
   * `PaymentSubmission` at all, so they cannot be found here by construction.
   */
  async firstRealPayment(
    client: Prisma.TransactionClient | PrismaService,
    userId: string,
  ): Promise<{ id: string; amountCents: number } | null> {
    const submissions = await client.paymentSubmission.findMany({
      where: {
        userId,
        status: 'approved',
        isFree: false,
        amountCents: { gt: 0 },
        refunds: { none: {} },
        walletRefunds: { none: {} },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: TRIGGER_SCAN,
      select: {
        id: true,
        amountCents: true,
        walletTransaction: { select: { createdAt: true } },
      },
    });

    for (const submission of submissions) {
      if (!submission.walletTransaction) return { id: submission.id, amountCents: submission.amountCents };
      const at = submission.walletTransaction.createdAt;
      const [income, spent] = await Promise.all([
        client.walletTransaction.aggregate({
          where: { userId, countsAsIncome: true, createdAt: { lte: at } },
          _sum: { amountCents: true },
        }),
        client.walletTransaction.aggregate({
          where: { userId, kind: 'course_purchase', createdAt: { lte: at } },
          _sum: { amountCents: true },
        }),
      ]);
      if (realMoneyCovers(income._sum.amountCents ?? 0, Math.abs(spent._sum.amountCents ?? 0))) {
        return { id: submission.id, amountCents: submission.amountCents };
      }
    }
    return null;
  }

  /**
   * Pay one referral, or refuse it, or leave it waiting. Idempotent: a
   * referral that is no longer `joined` is `skipped`, and the conditional
   * UPDATE plus the ledger's `(referral_id, user_id, kind)` UNIQUE make a
   * second reward impossible even when two sweeps race.
   */
  async reward(referralId: string, now: Date = new Date()): Promise<RewardOutcome> {
    const announce: string[] = [];
    let outcome: RewardOutcome;
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        const referral = await tx.referral.findUnique({
          where: { id: referralId },
          select: { id: true, status: true, referrerUserId: true, referredUserId: true },
        });
        if (!referral || referral.status !== 'joined') return 'skipped';

        // One referrer's rewards serialise, so two friends paying in the same
        // second cannot both read «9 this month» under a cap of 10.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`referral:${referral.referrerUserId}`}, 0))`;

        const program = await readReferralProgram(tx);
        if (!program.enabled) return 'waiting';

        const trigger = await this.firstRealPayment(tx, referral.referredUserId);
        if (!trigger) return 'waiting';

        const people = await tx.user.findMany({
          where: { id: { in: [referral.referrerUserId, referral.referredUserId] } },
          select: PERSON_SELECT,
        });
        const referrer = people.find((person) => person.id === referral.referrerUserId);
        const referred = people.find((person) => person.id === referral.referredUserId);
        if (!referrer || !referred) return 'skipped';

        let block: string | null = referralAbuse(phonesOf(referrer), phonesOf(referred));
        if (!block) {
          const thisMonth = await tx.referral.count({
            where: {
              referrerUserId: referral.referrerUserId,
              status: { in: ['credited', 'reversed'] },
              creditedAt: { gte: cairoMonthStart(now) },
            },
          });
          if (thisMonth >= program.monthlyCap) block = 'monthly_cap';
        }

        if (block) {
          const moved = await tx.referral.updateMany({
            where: { id: referral.id, status: 'joined' },
            data: { status: 'blocked', blockReason: block, triggerSubmissionId: trigger.id },
          });
          if (moved.count === 0) return 'skipped';
          await this.audit.recordTx(tx, {
            action: 'referral:block',
            resourceType: AUDIT_RESOURCES.referral,
            resourceId: referral.id,
            outcome: 'denied',
            metadata: {
              referrerUserId: referral.referrerUserId,
              referredUserId: referral.referredUserId,
              submissionId: trigger.id,
              reason: block,
            },
          });
          return 'blocked';
        }

        const moved = await tx.referral.updateMany({
          where: { id: referral.id, status: 'joined' },
          data: {
            status: 'credited',
            triggerSubmissionId: trigger.id,
            referrerRewardCents: program.referrerRewardCents,
            friendRewardCents: program.friendRewardCents,
            creditedAt: now,
          },
        });
        if (moved.count === 0) return 'skipped';

        const rows: Record<string, unknown> = {};
        const sides = [
          { userId: referral.referrerUserId, amountCents: program.referrerRewardCents, side: 'referrer' },
          { userId: referral.referredUserId, amountCents: program.friendRewardCents, side: 'friend' },
        ];
        for (const { userId, amountCents, side } of sides) {
          if (amountCents <= 0) continue;
          const row = await creditWallet(tx, {
            userId,
            kind: 'referral_reward',
            amountCents,
            // Never income: no money arrived. The CHECK says so too.
            countsAsIncome: false,
            referralId: referral.id,
          });
          rows[side] = { transactionId: row.id, amountCents, balanceAfterCents: row.balanceAfterCents };
          await this.notifications.emit(tx, {
            userId,
            kind: 'wallet_credited',
            amountCents,
            source: 'referral',
          });
          announce.push(userId);
        }

        await this.audit.recordTx(tx, {
          action: 'referral:reward',
          resourceType: AUDIT_RESOURCES.referral,
          resourceId: referral.id,
          outcome: 'success',
          metadata: {
            referrerUserId: referral.referrerUserId,
            referredUserId: referral.referredUserId,
            submissionId: trigger.id,
            ...rows,
          },
        });
        return 'credited';
      });
    } catch (error) {
      // The ledger's UNIQUE, or the submission's: somebody else rewarded it
      // first, and the transaction rolled back whole. That is the answer.
      if (isUniqueViolation(error)) return 'skipped';
      throw error;
    }

    for (const userId of announce) await this.notifications.announce(userId);
    return outcome;
  }

  /* ── taking it back ──────────────────────────────────────────────────── */

  /**
   * Reverse a credited referral — the friend's payment was refunded
   * (`reason: 'refund'`), or an admin voided it (`'void'`). Each side gives
   * back its reward or whatever is left of it (`reversalTake`); what was
   * already spent is not chased into a negative balance.
   *
   * No notification, for the reason `WalletService.debit` gives: «اتخصم من
   * محفظتك» arriving with no context reads as the platform taking money. The
   * statement names the row («مكافأة دعوة اترجعت»).
   */
  private async takeBack(
    tx: Prisma.TransactionClient,
    referral: {
      id: string;
      referrerUserId: string;
      referredUserId: string;
      referrerRewardCents: number | null;
      friendRewardCents: number | null;
    },
  ): Promise<{ referrer: number; friend: number }> {
    const taken = { referrer: 0, friend: 0 };
    const sides = [
      { key: 'referrer' as const, userId: referral.referrerUserId, reward: referral.referrerRewardCents ?? 0 },
      { key: 'friend' as const, userId: referral.referredUserId, reward: referral.friendRewardCents ?? 0 },
    ];
    for (const side of sides) {
      if (side.reward <= 0) continue;
      // The wallet's row lock first, so the balance read and the debit see
      // the same number — a purchase racing this waits for it.
      const rows = await tx.$queryRaw<{ balance_cents: number }[]>`
        SELECT "balance_cents" FROM "app"."wallets" WHERE "user_id" = ${side.userId} FOR UPDATE
      `;
      const take = reversalTake(rows[0]?.balance_cents ?? 0, side.reward);
      if (take <= 0) continue;
      await debitWallet(tx, {
        userId: side.userId,
        kind: 'referral_reversal',
        amountCents: take,
        countsAsIncome: false,
        referralId: referral.id,
      });
      taken[side.key] = take;
    }
    return taken;
  }

  /** The triggering payment was refunded after the reward landed. */
  async reverseForRefund(referralId: string, now: Date = new Date()): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const referral = await tx.referral.findUnique({
          where: { id: referralId },
          select: {
            id: true,
            status: true,
            referrerUserId: true,
            referredUserId: true,
            referrerRewardCents: true,
            friendRewardCents: true,
            triggerSubmissionId: true,
          },
        });
        if (!referral || referral.status !== 'credited') return false;

        const moved = await tx.referral.updateMany({
          where: { id: referral.id, status: 'credited' },
          data: { status: 'reversed', reversedAt: now },
        });
        if (moved.count === 0) return false;

        const taken = await this.takeBack(tx, referral);
        await tx.referral.update({
          where: { id: referral.id },
          data: { reversedCents: taken.referrer + taken.friend },
        });
        await this.audit.recordTx(tx, {
          action: 'referral:reverse',
          resourceType: AUDIT_RESOURCES.referral,
          resourceId: referral.id,
          outcome: 'success',
          metadata: { reason: 'refund', submissionId: referral.triggerSubmissionId, taken },
        });
        return true;
      });
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  /* ── admin ───────────────────────────────────────────────────────────── */

  program(): Promise<ReferralProgram> {
    return readReferralProgram(this.prisma);
  }

  async updateProgram(adminId: string, input: ReferralProgram): Promise<ReferralProgram> {
    await this.prisma.$transaction(async (tx) => {
      await tx.referralProgram.upsert({
        where: { id: 1 },
        create: { id: 1, ...input, updatedBy: adminId },
        update: { ...input, updatedBy: adminId },
      });
      await this.audit.recordTx(tx, {
        action: 'referral:settings',
        resourceType: AUDIT_RESOURCES.referralProgram,
        resourceId: '1',
        outcome: 'success',
        metadata: input,
      });
    });
    return this.program();
  }

  async list(query: AdminReferralQuery): Promise<AdminReferralList> {
    const where: Prisma.ReferralWhereInput = query.status ? { status: query.status } : {};
    const person = { select: { id: true, name: true, phoneNumber: true } } as const;
    const [rowCount, rows, byStatus, credited] = await Promise.all([
      this.prisma.referral.count({ where }),
      this.prisma.referral.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        include: { referrer: person, referred: person },
      }),
      this.prisma.referral.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.referral.aggregate({
        where: { status: 'credited' },
        _sum: { referrerRewardCents: true, friendRewardCents: true },
      }),
    ]);

    const count = (status: ReferralStatus) =>
      byStatus.find((group) => group.status === status)?._count._all ?? 0;

    return {
      rowCount,
      rows: rows.map(
        (row): AdminReferralRow => ({
          id: row.id,
          referrer: { id: row.referrer.id, name: row.referrer.name, phone: row.referrer.phoneNumber },
          referred: { id: row.referred.id, name: row.referred.name, phone: row.referred.phoneNumber },
          status: row.status,
          blockReason: row.blockReason,
          referrerRewardCents: row.referrerRewardCents,
          friendRewardCents: row.friendRewardCents,
          reversedCents: row.reversedCents,
          voidReason: row.voidReason,
          noticeOutcome: row.noticeOutcome,
          createdAt: row.createdAt.toISOString(),
          creditedAt: row.creditedAt?.toISOString() ?? null,
          reversedAt: row.reversedAt?.toISOString() ?? null,
        }),
      ),
      totals: {
        joined: count('joined'),
        credited: count('credited'),
        reversed: count('reversed'),
        blocked: count('blocked'),
        voided: count('voided'),
        creditedCents: (credited._sum.referrerRewardCents ?? 0) + (credited._sum.friendRewardCents ?? 0),
      },
    };
  }

  /** «أكتر الطلبة دعوة» — by rewards still standing, then by sign-ups. */
  async top(): Promise<TopReferrer[]> {
    const credited = await this.prisma.referral.groupBy({
      by: ['referrerUserId'],
      where: { status: 'credited' },
      _count: { _all: true },
      _sum: { referrerRewardCents: true },
      orderBy: [{ _count: { referrerUserId: 'desc' } }, { referrerUserId: 'asc' }],
      take: TOP_LIMIT,
    });
    if (credited.length === 0) return [];

    const ids = credited.map((group) => group.referrerUserId);
    const [users, joined] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, phoneNumber: true } }),
      this.prisma.referral.groupBy({
        by: ['referrerUserId'],
        where: { referrerUserId: { in: ids }, status: { not: 'voided' } },
        _count: { _all: true },
      }),
    ]);

    return credited.flatMap((group) => {
      const user = users.find((candidate) => candidate.id === group.referrerUserId);
      if (!user) return [];
      return [
        {
          student: { id: user.id, name: user.name, phone: user.phoneNumber },
          joined: joined.find((row) => row.referrerUserId === user.id)?._count._all ?? 0,
          credited: group._count._all,
          earnedCents: group._sum.referrerRewardCents ?? 0,
        },
      ];
    });
  }

  /**
   * «إلغاء» — an admin decides this referral should never have counted. A
   * credited one gives its rewards back first (`takeBack`); a joined or
   * blocked one simply closes. A reversed one already gave its money back and
   * is final — 409, so the screen says so instead of pretending.
   */
  async void(adminId: string, referralId: string, input: VoidReferralInput): Promise<AdminReferralRow> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const referral = await tx.referral.findUnique({
        where: { id: referralId },
        select: {
          id: true,
          status: true,
          referrerUserId: true,
          referredUserId: true,
          referrerRewardCents: true,
          friendRewardCents: true,
        },
      });
      if (!referral) throw new NotFoundException();
      if (referral.status === 'voided' || referral.status === 'reversed') {
        throw new ConflictException({ code: `referral_${referral.status}`, message: 'already closed' });
      }

      const moved = await tx.referral.updateMany({
        where: { id: referral.id, status: referral.status },
        data: {
          status: 'voided',
          blockReason: null,
          voidedAt: now,
          voidedByUserId: adminId,
          voidReason: input.reason,
          ...(referral.status === 'credited' ? { reversedAt: now } : {}),
        },
      });
      if (moved.count === 0) throw new ConflictException('this referral just changed — reload');

      const taken = referral.status === 'credited' ? await this.takeBack(tx, referral) : null;
      if (taken) {
        await tx.referral.update({
          where: { id: referral.id },
          data: { reversedCents: taken.referrer + taken.friend },
        });
      }
      await this.audit.recordTx(tx, {
        action: 'referral:void',
        resourceType: AUDIT_RESOURCES.referral,
        resourceId: referral.id,
        outcome: 'success',
        metadata: { from: referral.status, reason: input.reason, taken },
      });
    });

    const page = await this.prisma.referral.findUniqueOrThrow({
      where: { id: referralId },
      include: {
        referrer: { select: { id: true, name: true, phoneNumber: true } },
        referred: { select: { id: true, name: true, phoneNumber: true } },
      },
    });
    return {
      id: page.id,
      referrer: { id: page.referrer.id, name: page.referrer.name, phone: page.referrer.phoneNumber },
      referred: { id: page.referred.id, name: page.referred.name, phone: page.referred.phoneNumber },
      status: page.status,
      blockReason: page.blockReason,
      referrerRewardCents: page.referrerRewardCents,
      friendRewardCents: page.friendRewardCents,
      reversedCents: page.reversedCents,
      voidReason: page.voidReason,
      noticeOutcome: page.noticeOutcome,
      createdAt: page.createdAt.toISOString(),
      creditedAt: page.creditedAt?.toISOString() ?? null,
      reversedAt: page.reversedAt?.toISOString() ?? null,
    };
  }

  /* ── what the sweeper asks ───────────────────────────────────────────── */

  /**
   * Joined referrals whose friend has an approved, paid, unrefunded payment —
   * the CANDIDATES. Whether one of those payments is real money is decided
   * per referral in `reward()`; one that is not (a course bought with gift
   * money) stays `joined` and is asked again next minute. Keyset-paged on the
   * uuid7 id, so a head of such waiting rows can never starve the rest.
   */
  async rewardCandidates(afterId: string | null, take: number): Promise<string[]> {
    const rows = await this.prisma.referral.findMany({
      where: {
        status: 'joined',
        ...(afterId ? { id: { gt: afterId } } : {}),
        referred: {
          paymentSubmissions: {
            some: {
              status: 'approved',
              isFree: false,
              amountCents: { gt: 0 },
              refunds: { none: {} },
              walletRefunds: { none: {} },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /** Credited referrals whose triggering payment has since been refunded. */
  async refundedCandidates(take: number): Promise<string[]> {
    const rows = await this.prisma.referral.findMany({
      where: {
        status: 'credited',
        triggerSubmission: { OR: [{ refunds: { some: {} } }, { walletRefunds: { some: {} } }] },
      },
      orderBy: { id: 'asc' },
      take,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  logFailure(what: string, referralId: string, error: unknown): void {
    this.logger.error({ err: error, referralId }, `referral ${what} failed`);
  }
}
