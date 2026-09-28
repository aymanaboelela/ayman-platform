import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  MyWallet,
  SubmitWalletTopupInput,
  WalletBalance,
  WalletTopup,
  WalletTransaction,
} from '@ayman/contracts/wallet';
import type {
  AdminApproveWalletTopupInput,
  AdminRejectWalletTopupInput,
  AdminWallet,
  AdminWalletCreditInput,
  AdminWalletDebitInput,
  AdminWalletSearch,
  AdminWalletTopupList,
  AdminWalletTopupQuery,
  AdminWalletTransaction,
} from '@ayman/contracts/admin/wallet';
import { toAsciiDigits } from '@ayman/contracts/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { NotificationsService } from '../notifications/notifications.service';
import type { Prisma } from '../../generated/prisma/client';
import { creditWallet, debitWallet, isUniqueViolation, walletBalance } from './wallet-ledger';

/** Same private prefix `POST /payments/screenshot` stores under — the top-up
 *  flow reuses that upload, so its keys are the payment desk's keys. */
const SCREENSHOT_PREFIX = 'payment-proof';

/** How many requests one student may have waiting at once. A request is a
 *  screenshot an admin has to open; three is generous for a real student and
 *  a wall for a script. */
const MAX_PENDING_TOPUPS = 3;

/** The statement's length on screen. An export is a different feature. */
const STATEMENT_LIMIT = 100;
const TOPUPS_LIMIT = 20;

const TRANSACTION_SELECT = {
  id: true,
  kind: true,
  amountCents: true,
  balanceAfterCents: true,
  countsAsIncome: true,
  note: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
  unlockCode: { select: { code: true } },
  topup: { select: { method: true } },
  purchase: { select: { course: { select: { title: true } } } },
  refundOfSubmission: { select: { course: { select: { title: true } } } },
} as const satisfies Prisma.WalletTransactionSelect;

type TransactionRecord = Prisma.WalletTransactionGetPayload<{ select: typeof TRANSACTION_SELECT }>;

function toStudentTransaction(row: TransactionRecord): WalletTransaction {
  return {
    id: row.id,
    kind: row.kind,
    amountCents: row.amountCents,
    balanceAfterCents: row.balanceAfterCents,
    courseTitle: row.purchase?.course.title ?? row.refundOfSubmission?.course.title ?? null,
    code: row.unlockCode?.code ?? null,
    method: row.topup?.method ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAdminTransaction(row: TransactionRecord): AdminWalletTransaction {
  return {
    ...toStudentTransaction(row),
    countsAsIncome: row.countsAsIncome,
    note: row.note,
    actor: row.actor,
  };
}

const TOPUP_SELECT = {
  id: true,
  method: true,
  amountCents: true,
  approvedAmountCents: true,
  sender: true,
  status: true,
  rejectionReason: true,
  createdAt: true,
  reviewedAt: true,
} as const satisfies Prisma.WalletTopupSelect;

function toTopup(row: Prisma.WalletTopupGetPayload<{ select: typeof TOPUP_SELECT }>): WalletTopup {
  return {
    id: row.id,
    method: row.method,
    amountCents: row.amountCents,
    approvedAmountCents: row.approvedAmountCents,
    sender: row.sender,
    status: row.status,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

/**
 * «المحفظة» — everything about a wallet that is not paying for a course.
 *
 * Buying FROM the wallet lives in `PaymentsService.purchaseFromWallet`,
 * because it is a subscription first: it has to reach exactly the grant and
 * enrollment an approved transfer reaches, through the same private writers.
 * Everything here only ever moves money, through `wallet-ledger.ts`.
 *
 * Every write is one transaction holding the ledger row, the notification and
 * the audit row (`recordTx`) — a movement never exists without its trail, and
 * a trail never outlives a movement that rolled back.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /* ── the live desk ───────────────────────────────────────────────────── */

  /**
   * «طلبات الشحن اتحركت» — the same live signal `PaymentsService.announceDesk`
   * sends for the payments queue, on the wallet's own queue. AFTER the commit
   * and never throwing: a screen that misses it redraws on its next poll.
   */
  async announceDesk(): Promise<void> {
    try {
      const waiting = await this.prisma.walletTopup.count({ where: { status: 'pending' } });
      await this.notifications.announceQueue('wallet-topups', waiting);
    } catch {
      // Deliberately swallowed — the write already committed.
    }
  }

  /* ── student ─────────────────────────────────────────────────────────── */

  async mine(userId: string): Promise<MyWallet> {
    const [balanceCents, pending, transactions, topups] = await Promise.all([
      walletBalance(this.prisma, userId),
      this.prisma.walletTopup.aggregate({
        where: { userId, status: 'pending' },
        _sum: { amountCents: true },
      }),
      this.prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: STATEMENT_LIMIT,
        select: TRANSACTION_SELECT,
      }),
      this.prisma.walletTopup.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: TOPUPS_LIMIT,
        select: TOPUP_SELECT,
      }),
    ]);

    return {
      balanceCents,
      pendingTopupCents: pending._sum.amountCents ?? 0,
      transactions: transactions.map(toStudentTransaction),
      topups: topups.map(toTopup),
    };
  }

  async balance(userId: string): Promise<WalletBalance> {
    const [balanceCents, pending] = await Promise.all([
      walletBalance(this.prisma, userId),
      this.prisma.walletTopup.aggregate({
        where: { userId, status: 'pending' },
        _sum: { amountCents: true },
      }),
    ]);
    return { balanceCents, pendingTopupCents: pending._sum.amountCents ?? 0 };
  }

  /**
   * «ابعت طلب الشحن» — step two of the two-step upload, exactly like a course
   * claim: the screenshot went up through `POST /payments/screenshot` first.
   * The request and the admins' alert are one transaction, for the reason
   * `PaymentsService.submit` gives: a request nobody is told about is a
   * student waiting on a queue no one knows has grown.
   */
  async submitTopup(userId: string, input: SubmitWalletTopupInput): Promise<WalletTopup> {
    if (!input.screenshotKey.startsWith(`${SCREENSHOT_PREFIX}/`)) {
      // Same guard `PaymentsService.submit` runs: a key from an unrelated
      // feature would let an admin approve money by looking at someone
      // else's picture.
      throw new BadRequestException('screenshotKey was not issued by POST /payments/screenshot');
    }

    const waiting = await this.prisma.walletTopup.count({ where: { userId, status: 'pending' } });
    if (waiting >= MAX_PENDING_TOPUPS) {
      throw new ConflictException({
        code: 'wallet_too_many_pending',
        message: 'too many top-up requests are already waiting',
      });
    }

    const { topup, admins } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.walletTopup.create({
        data: {
          userId,
          method: input.method,
          amountCents: input.amountCents,
          sender: input.sender,
          note: input.note,
          screenshotKey: input.screenshotKey,
        },
        select: TOPUP_SELECT,
      });
      const recipients = await this.notifications.emitToPermission(
        tx,
        'payment:read',
        'wallet_topup_submitted',
        { topupId: created.id, amountCents: created.amountCents },
      );
      await this.audit.recordTx(tx, {
        action: 'wallet:topup-submit',
        resourceType: AUDIT_RESOURCES.walletTopup,
        resourceId: created.id,
        outcome: 'success',
        metadata: { userId, method: input.method, amountCents: input.amountCents },
      });
      return { topup: created, admins: recipients };
    });

    await this.notifications.announceAll(admins);
    await this.announceDesk();
    return toTopup(topup);
  }

  /* ── admin: the wallet desk ─────────────────────────────────────────── */

  /**
   * «دوّر على الطالب». An empty search lists the wallets that moved most
   * recently, which is what the screen opens on — the student somebody just
   * called about is almost always one of them.
   */
  async search(q: string): Promise<AdminWalletSearch> {
    const query = q.trim();
    const [rows, totals, pending] = await Promise.all([
      query.length === 0 ? this.recentWallets() : this.findStudents(query),
      this.prisma.wallet.aggregate({
        where: { balanceCents: { gt: 0 } },
        _sum: { balanceCents: true },
        _count: { _all: true },
      }),
      this.prisma.walletTopup.aggregate({
        where: { status: 'pending' },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
    ]);
    return {
      rows,
      totals: {
        balanceCents: totals._sum.balanceCents ?? 0,
        walletCount: totals._count._all,
        pendingCount: pending._count._all,
        pendingCents: pending._sum.amountCents ?? 0,
      },
    };
  }

  private async recentWallets(): Promise<AdminWalletSearch['rows']> {
    const wallets = await this.prisma.wallet.findMany({
      orderBy: [{ updatedAt: 'desc' }, { userId: 'desc' }],
      take: 20,
      select: {
        balanceCents: true,
        updatedAt: true,
        user: { select: { id: true, name: true, phoneNumber: true, email: true } },
      },
    });
    return wallets.map((wallet) => ({
      id: wallet.user.id,
      name: wallet.user.name,
      phone: wallet.user.phoneNumber,
      email: wallet.user.email,
      balanceCents: wallet.balanceCents,
      lastMovedAt: wallet.updatedAt.toISOString(),
    }));
  }

  /**
   * Name, phone or email — the three things an admin has in hand when a
   * student messages. Phone is matched on its digits with the leading zero
   * dropped, because the account stores `+2010…` and the admin types `010…`.
   */
  private async findStudents(query: string): Promise<AdminWalletSearch['rows']> {
    const digits = toAsciiDigits(query).replace(/\D/g, '').replace(/^0+/, '').replace(/^20/, '');
    const phoneMatch: Prisma.UserWhereInput[] =
      digits.length >= 4
        ? [{ phoneNumber: { contains: digits } }, { studentProfile: { phone: { contains: digits } } }]
        : [];
    const users = await this.prisma.user.findMany({
      where: {
        studentProfile: { isNot: null },
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { studentProfile: { fullName: { contains: query, mode: 'insensitive' } } },
          { email: { contains: query, mode: 'insensitive' } },
          ...phoneMatch,
        ],
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 20,
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        wallet: { select: { balanceCents: true, updatedAt: true } },
      },
    });
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      phone: user.phoneNumber,
      email: user.email,
      balanceCents: user.wallet?.balanceCents ?? 0,
      lastMovedAt: user.wallet?.updatedAt.toISOString() ?? null,
    }));
  }

  async adminWallet(userId: string): Promise<AdminWallet> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phoneNumber: true, email: true },
    });
    if (!user) throw new NotFoundException('student not found');

    const [balanceCents, pending, income, transactions] = await Promise.all([
      walletBalance(this.prisma, userId),
      this.prisma.walletTopup.aggregate({
        where: { userId, status: 'pending' },
        _sum: { amountCents: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: { userId, countsAsIncome: true },
        _sum: { amountCents: true },
      }),
      this.prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: STATEMENT_LIMIT,
        select: TRANSACTION_SELECT,
      }),
    ]);

    return {
      student: { id: user.id, name: user.name, phone: user.phoneNumber, email: user.email },
      balanceCents,
      pendingTopupCents: pending._sum.amountCents ?? 0,
      incomeCents: income._sum.amountCents ?? 0,
      transactions: transactions.map(toAdminTransaction),
    };
  }

  /** Only an account that is a student may hold a wallet — an admin crediting
   *  a staff account by picking the wrong row is the mistake this stops. */
  private async assertStudent(userId: string): Promise<void> {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { userId: true },
    });
    if (!profile) throw new NotFoundException('student not found');
  }

  /**
   * «اشحن» — an admin puts money in by hand.
   *
   * `paid` is copied onto the row as `countsAsIncome` and is the whole
   * difference between «دفعلي كاش» (income today) and «هدية / تعويض» (never
   * income). The idempotency key is the form's: a double press, or a retry
   * after a dropped response, is the SAME credit — the second one dies on the
   * ledger's UNIQUE and is answered with the wallet as the first left it.
   */
  async credit(adminId: string, userId: string, input: AdminWalletCreditInput): Promise<AdminWallet> {
    await this.assertStudent(userId);

    try {
      await this.prisma.$transaction(async (tx) => {
        const row = await creditWallet(tx, {
          userId,
          kind: 'admin_credit',
          amountCents: input.amountCents,
          countsAsIncome: input.paid,
          idempotencyKey: input.idempotencyKey,
          actorUserId: adminId,
          note: input.note,
        });
        await this.notifications.emit(tx, {
          userId,
          kind: 'wallet_credited',
          amountCents: input.amountCents,
          source: 'admin',
        });
        await this.audit.recordTx(tx, {
          action: 'wallet:admin-credit',
          resourceType: AUDIT_RESOURCES.walletTransaction,
          resourceId: row.id,
          outcome: 'success',
          metadata: {
            userId,
            amountCents: input.amountCents,
            paid: input.paid,
            balanceAfterCents: row.balanceAfterCents,
            note: input.note,
          },
        });
      });
    } catch (error) {
      if (!(await this.isReplay(error, input.idempotencyKey, userId))) throw error;
      return this.adminWallet(userId);
    }

    await this.notifications.announce(userId);
    return this.adminWallet(userId);
  }

  /**
   * «خصم» — money back out, never below zero. A correction is a NEW row in
   * the opposite direction; nothing ever edits the wrong one.
   *
   * No notification: this is the admin correcting his own records (or
   * handing cash back across a desk), and «اتخصم من محفظتك» arriving with no
   * context reads as the platform taking money.
   */
  async debit(adminId: string, userId: string, input: AdminWalletDebitInput): Promise<AdminWallet> {
    await this.assertStudent(userId);

    try {
      await this.prisma.$transaction(async (tx) => {
        const row = await debitWallet(tx, {
          userId,
          kind: 'admin_debit',
          amountCents: input.amountCents,
          countsAsIncome: input.reducesIncome,
          idempotencyKey: input.idempotencyKey,
          actorUserId: adminId,
          note: input.note,
        });
        await this.audit.recordTx(tx, {
          action: 'wallet:admin-debit',
          resourceType: AUDIT_RESOURCES.walletTransaction,
          resourceId: row.id,
          outcome: 'success',
          metadata: {
            userId,
            amountCents: input.amountCents,
            reducesIncome: input.reducesIncome,
            balanceAfterCents: row.balanceAfterCents,
            note: input.note,
          },
        });
      });
    } catch (error) {
      if (!(await this.isReplay(error, input.idempotencyKey, userId))) throw error;
    }

    return this.adminWallet(userId);
  }

  /**
   * Whether a failed write was the SAME press arriving twice. The second one
   * either dies on the ledger's UNIQUE or — for a debit — is refused by the
   * balance the first one left; in both cases the key now names a committed
   * row for this student, and that row is the answer. Anything else is a real
   * error and goes back up.
   */
  private async isReplay(_error: unknown, idempotencyKey: string, userId: string): Promise<boolean> {
    const existing = await this.prisma.walletTransaction.findUnique({
      where: { idempotencyKey },
      select: { userId: true },
    });
    if (!existing) return false;
    if (existing.userId !== userId) {
      // The same key on a different student's wallet is not a retry — it is a
      // client reusing a key it should not have. Refused, not silently «done».
      throw new ConflictException('this request key was already used');
    }
    return true;
  }

  /* ── admin: «طلبات الشحن» ──────────────────────────────────────────── */

  async listTopups(query: AdminWalletTopupQuery): Promise<AdminWalletTopupList> {
    const where: Prisma.WalletTopupWhereInput = query.status ? { status: query.status } : {};
    const q = query.q.trim();
    const search: Prisma.WalletTopupWhereInput = q
      ? {
          OR: [
            { sender: { contains: q, mode: 'insensitive' } },
            { user: { name: { contains: q, mode: 'insensitive' } } },
            { user: { phoneNumber: { contains: q.replace(/^0/, '') } } },
          ],
        }
      : {};
    const filter: Prisma.WalletTopupWhereInput = { AND: [where, search] };

    const [rowCount, rows] = await this.prisma.$transaction([
      this.prisma.walletTopup.count({ where: filter }),
      this.prisma.walletTopup.findMany({
        where: filter,
        // Oldest first by default — a review queue is answered in the order
        // people joined it. The `id` tiebreak keeps pagination stable.
        orderBy:
          query.sort === 'newest'
            ? [{ createdAt: 'desc' }, { id: 'desc' }]
            : [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        select: {
          ...TOPUP_SELECT,
          userId: true,
          note: true,
          user: {
            select: {
              name: true,
              phoneNumber: true,
              wallet: { select: { balanceCents: true } },
            },
          },
          reviewedBy: { select: { name: true } },
        },
      }),
    ]);

    return {
      rowCount,
      rows: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        studentName: row.user.name,
        studentPhone: row.user.phoneNumber,
        method: row.method,
        amountCents: row.amountCents,
        approvedAmountCents: row.approvedAmountCents,
        sender: row.sender,
        note: row.note,
        status: row.status,
        rejectionReason: row.rejectionReason,
        balanceCents: row.user.wallet?.balanceCents ?? 0,
        createdAt: row.createdAt.toISOString(),
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
        reviewedBy: row.reviewedBy?.name ?? null,
      })),
    };
  }

  async topupScreenshotKey(id: string): Promise<string> {
    const row = await this.prisma.walletTopup.findUnique({
      where: { id },
      select: { screenshotKey: true },
    });
    if (!row) throw new NotFoundException();
    return row.screenshotKey;
  }

  /**
   * «اقبل» — credit the wallet with what actually arrived.
   *
   * Two guards, either sufficient on its own: the request moves out of
   * `pending` with a conditional `updateMany` (two admins pressing at once —
   * one gets zero rows), and the ledger's UNIQUE on `topup_id` makes a second
   * credit for the same request impossible at the database.
   */
  async approveTopup(
    adminId: string,
    id: string,
    input: AdminApproveWalletTopupInput,
  ): Promise<{ id: string; status: 'approved'; amountCents: number; balanceCents: number }> {
    const topup = await this.prisma.walletTopup.findUnique({
      where: { id },
      select: { id: true, userId: true, amountCents: true, status: true },
    });
    if (!topup) throw new NotFoundException();
    if (topup.status !== 'pending') throw new ConflictException('this request was already reviewed');

    const amountCents = input.amountCents ?? topup.amountCents;
    const now = new Date();

    let balanceCents: number;
    try {
      balanceCents = await this.prisma.$transaction(async (tx) => {
        const moved = await tx.walletTopup.updateMany({
          where: { id, status: 'pending' },
          data: {
            status: 'approved',
            approvedAmountCents: amountCents,
            reviewedByUserId: adminId,
            reviewedAt: now,
          },
        });
        if (moved.count === 0) throw new ConflictException('this request was already reviewed');

        const row = await creditWallet(tx, {
          userId: topup.userId,
          kind: 'transfer_topup',
          amountCents,
          // Always income — money that arrived by transfer. The CHECK says so too.
          countsAsIncome: true,
          topupId: id,
          actorUserId: adminId,
        });
        await this.notifications.emit(tx, {
          userId: topup.userId,
          kind: 'wallet_credited',
          amountCents,
          source: 'topup',
        });
        await this.audit.recordTx(tx, {
          action: 'wallet:topup-approve',
          resourceType: AUDIT_RESOURCES.walletTopup,
          resourceId: id,
          outcome: 'success',
          metadata: {
            userId: topup.userId,
            requestedCents: topup.amountCents,
            amountCents,
            transactionId: row.id,
            balanceAfterCents: row.balanceAfterCents,
          },
        });
        return row.balanceAfterCents;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('this request was already reviewed');
      throw error;
    }

    await this.notifications.announce(topup.userId);
    await this.announceDesk();
    return { id, status: 'approved', amountCents, balanceCents };
  }

  async rejectTopup(adminId: string, id: string, input: AdminRejectWalletTopupInput): Promise<void> {
    const topup = await this.prisma.walletTopup.findUnique({
      where: { id },
      select: { id: true, userId: true, amountCents: true, status: true },
    });
    if (!topup) throw new NotFoundException();
    if (topup.status !== 'pending') throw new ConflictException('this request was already reviewed');

    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.walletTopup.updateMany({
        where: { id, status: 'pending' },
        data: {
          status: 'rejected',
          rejectionReason: input.reason,
          reviewedByUserId: adminId,
          reviewedAt: new Date(),
        },
      });
      if (moved.count === 0) throw new ConflictException('this request was already reviewed');

      await this.notifications.emit(tx, {
        userId: topup.userId,
        kind: 'wallet_topup_rejected',
        topupId: id,
        amountCents: topup.amountCents,
        reason: input.reason,
      });
      await this.audit.recordTx(tx, {
        action: 'wallet:topup-reject',
        resourceType: AUDIT_RESOURCES.walletTopup,
        resourceId: id,
        outcome: 'success',
        metadata: { userId: topup.userId, amountCents: topup.amountCents, reason: input.reason },
      });
    });

    await this.notifications.announce(topup.userId);
    await this.announceDesk();
  }
}
