import { Injectable } from '@nestjs/common';
import type {
  AdminTransferFilter,
  AdminTransferList,
  IngestTransfersInput,
  IngestTransfersResult,
} from '@ayman/contracts/admin/transfers';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { BookOrdersService } from '../book-orders/book-orders.service';
import { PaymentsService } from './payments.service';
import { parseTransferText, type ParsedTransfer } from './transfer-parse';

/**
 * «التحويلات الواردة» — the ledger of money that arrived, the addresses it
 * taught us, and the approvals it produces.
 *
 * ## The whole idea in one paragraph
 *
 * An InstaPay notification says an amount and an address
 * (`moazkoritam@instapay`). The address matches nothing the platform holds, so
 * the platform learns it: the first payment from an unknown address is
 * reviewed by hand exactly as every payment used to be, and approving the
 * student's claim records the address against that student. Every later
 * payment from it is matched and approved with nobody looking. The manual
 * queue is not removed on day one — it DRAINS.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService,
    private readonly bookOrders: BookOrdersService,
  ) {}

  /**
   * Parse a capture, store what is new, and settle whatever it pays for.
   *
   * ## Why the same amount twice is treated as one transfer
   *
   * Both feeds fire for a single payment: the bank sends an SMS and InstaPay
   * raises a push, so a handset carrying both reports every transfer twice.
   * And a notification list pasted in on Tuesday still contains Monday's.
   * Neither text says which transfer it is beyond its amount, so an amount
   * already held is taken to be the same money — over the last `DEDUPE_DAYS`.
   *
   * Erring this way is the safe direction. A duplicate that slips through
   * cannot approve anything twice (the claim it would pay for is no longer
   * pending), so the cost is a puzzling row in the queue; a genuine second
   * payment that gets absorbed shows up as a student whose claim sits
   * unmatched, which is exactly the manual queue this feature was built
   * beside.
   *
   * The two feeds are not equal, and the second sighting is not always
   * worthless: an SMS knows no sender, a notification does. So a row first
   * seen over SMS is UPGRADED when the notification for it arrives — and
   * settled at that point, because only then can it identify anybody.
   */
  async ingest(input: IngestTransfersInput): Promise<IngestTransfersResult> {
    const parsed = parseTransferText(input.text);
    const receivedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();
    const since = new Date(receivedAt.getTime() - DEDUPE_DAYS * 24 * 60 * 60 * 1000);

    let created = 0;
    let duplicates = 0;
    let matched = 0;
    let unreadable = 0;

    for (const transfer of parsed) {
      if (transfer.amountCents === null) {
        await this.store(transfer, receivedAt);
        created += 1;
        unreadable += 1;
        continue;
      }

      const held = await this.prisma.incomingTransfer.findFirst({
        where: { amountCents: transfer.amountCents, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, senderHandle: true, matchedSubmissionId: true },
      });

      if (held) {
        duplicates += 1;
        // Nothing to add, or nothing left to do with it.
        if (transfer.senderHandle === null || held.senderHandle !== null) continue;
        if (held.matchedSubmissionId !== null) continue;

        await this.prisma.incomingTransfer.update({
          where: { id: held.id },
          data: {
            senderHandle: transfer.senderHandle,
            source: 'notification',
            rawLine: transfer.rawLine,
          },
        });
        // It could not be settled before: an SMS names nobody. Now it can.
        if (await this.settle(held.id, transfer.amountCents, transfer.senderHandle)) matched += 1;
        continue;
      }

      const row = await this.store(transfer, receivedAt);
      created += 1;
      if (await this.settle(row.id, transfer.amountCents, transfer.senderHandle)) matched += 1;
    }

    await this.audit.record({
      action: 'transfer:ingest',
      resourceType: AUDIT_RESOURCES.incomingTransfer,
      // A whole capture, not one row — there is no single id to name, and the
      // counts are the fact worth keeping.
      resourceId: null,
      // Posted by the receiving handset holding a token, with no session.
      actorUserId: null,
      outcome: 'success',
      metadata: { read: parsed.length, created, duplicates, matched, unreadable },
    });

    return { read: parsed.length, created, duplicates, matched, unreadable };
  }

  private async store(transfer: ParsedTransfer, receivedAt: Date): Promise<{ id: string }> {
    return this.prisma.incomingTransfer.create({
      data: {
        source: transfer.source,
        amountCents: transfer.amountCents,
        senderHandle: transfer.senderHandle,
        rawLine: transfer.rawLine,
        receivedAt,
      },
      select: { id: true },
    });
  }

  /**
   * Settle the one thing this money pays for, if exactly one can be
   * identified — a course subscription, or a printed book.
   *
   * Two ways in, and the difference between them is how much is being assumed:
   *
   * **A known address.** The platform has seen this address pay before and
   * knows whose it is. It settles that student's own outstanding thing, and
   * only when the amount is the amount owed. Nothing is assumed.
   *
   * **An unknown address, and exactly one outstanding thing in the whole
   * platform at this amount.** There is nothing else it could be paying for,
   * so it is settled and the address is learned. This is what makes the
   * feature work from day one instead of after a month of manual approvals,
   * and it is the weaker of the two: a personal transfer of exactly 250,
   * arriving while exactly one student has a pending 250 claim, would approve
   * that claim. The bound on the damage is that something must be outstanding
   * and match to the piastre, and the `IncomingTransfer` row records what was
   * believed and why.
   *
   * An SMS settles nothing either way — it names no sender, so "exactly one
   * claim at this amount" would be the only test, and money arriving for a
   * reason the platform knows nothing about is far too ordinary to approve on
   * that alone.
   */
  private async settle(
    transferId: string,
    amountCents: number,
    senderHandle: string | null,
  ): Promise<boolean> {
    if (senderHandle === null) return false;

    const known = await this.prisma.studentPaymentAddress.findUnique({
      where: { handle: senderHandle },
      select: { userId: true },
    });

    const owner = known ? { userId: known.userId } : {};

    const claims = await this.prisma.paymentSubmission.findMany({
      where: { status: 'pending', amountCents, ...owner },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true },
    });

    // الكتب — bought over the same InstaPay account, at their own totals, and
    // identified the same way. Searched alongside the subscriptions rather
    // than after them: money that could be either is money nobody should
    // settle automatically, and only counting both together can see that.
    const orders = await this.prisma.bookOrder.findMany({
      where: { status: 'address_only', deletedAt: null, amountCents, ...owner },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true },
    });

    // Two things this money could equally be paying for is a question, not an
    // answer. It goes to the queue with everything an admin needs to settle it
    // in one look.
    if (claims.length + orders.length !== 1) return false;

    const claim = claims[0];
    if (claim) {
      if ((await this.payments.approveFromTransfer(claim.id, transferId)) === null) return false;
      if (!known) await this.learn(claim.userId, senderHandle, transferId);
      return true;
    }

    const order = orders[0] as { id: string; userId: string | null };
    if (!(await this.bookOrders.markPaidFromTransfer(order.id, transferId))) return false;
    // A guest checkout has no account to bind the address to. The order is
    // still marked paid — the money arrived either way — and the address is
    // simply not learned from it.
    if (!known && order.userId !== null) await this.learn(order.userId, senderHandle, transferId);
    return true;
  }

  /**
   * Bind an InstaPay address to a student, from now on.
   *
   * `handle` is UNIQUE, so a race — two transfers from one new address landing
   * together — resolves to whichever wrote first, and the loser is a no-op
   * rather than an error. The winner is right either way: both were paying for
   * claims of the same student, or the second would not have matched.
   */
  private async learn(userId: string, handle: string, transferId: string): Promise<void> {
    try {
      await this.prisma.studentPaymentAddress.create({
        data: { userId, handle, learnedFromTransferId: transferId },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return;
    }

    await this.audit.record({
      action: 'transfer:learn-address',
      resourceType: AUDIT_RESOURCES.incomingTransfer,
      resourceId: transferId,
      actorUserId: null,
      outcome: 'success',
      metadata: { userId, handle },
    });
  }

  /**
   * The same learning, driven by an admin's own approval — the path this
   * feature is really built around.
   *
   * An admin approving a claim by hand has just done the identification the
   * platform could not: they looked at the screenshot, looked at the phone,
   * and said yes. If exactly one unmatched notification is sitting in the
   * ledger for that amount, it is what they were looking at, and its address
   * belongs to that student. Every payment from it after today needs nobody.
   *
   * Deliberately silent on ambiguity. Two candidate transfers means the admin
   * approved one of two identical amounts and this cannot tell which; binding
   * the wrong address to a student would make FUTURE approvals wrong, which is
   * far worse than learning nothing today.
   */
  async learnFromApproval(submissionId: string): Promise<void> {
    const submission = await this.prisma.paymentSubmission.findUnique({
      where: { id: submissionId },
      select: { userId: true, amountCents: true, createdAt: true },
    });
    if (!submission) return;

    const since = new Date(submission.createdAt.getTime() - LEARN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const candidates = await this.prisma.incomingTransfer.findMany({
      where: {
        amountCents: submission.amountCents,
        senderHandle: { not: null },
        matchedSubmissionId: null,
        dismissedAt: null,
        receivedAt: { gte: since },
      },
      select: { id: true, senderHandle: true },
    });
    if (candidates.length !== 1) return;
    const candidate = candidates[0] as { id: string; senderHandle: string };

    const alreadyKnown = await this.prisma.studentPaymentAddress.findUnique({
      where: { handle: candidate.senderHandle },
      select: { id: true },
    });
    if (alreadyKnown) return;

    await this.learn(submission.userId, candidate.senderHandle, candidate.id);
    // The transfer paid for this claim, which is now approved. Linking it
    // keeps the ledger honest — otherwise the money would sit under «محتاجة
    // مراجعة» forever, for a payment that has already been settled.
    await this.prisma.incomingTransfer.updateMany({
      where: { id: candidate.id, matchedSubmissionId: null },
      data: { matchedSubmissionId: submissionId },
    });
  }

  /** The admin ledger. `unmatched` first-class, because money nobody can
   *  place is the only slice that needs a human. */
  async adminList(filter: AdminTransferFilter, take: number): Promise<AdminTransferList> {
    const where =
      filter === 'unmatched'
        ? { matchedSubmissionId: null, dismissedAt: null }
        : filter === 'matched'
          ? { matchedSubmissionId: { not: null } }
          : filter === 'dismissed'
            ? { dismissedAt: { not: null } }
            : {};

    const [rows, rowCount] = await Promise.all([
      this.prisma.incomingTransfer.findMany({
        where,
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        take,
        select: {
          id: true,
          source: true,
          amountCents: true,
          senderHandle: true,
          rawLine: true,
          receivedAt: true,
          matchedSubmissionId: true,
          matchedBookOrderId: true,
          dismissedAt: true,
        },
      }),
      this.prisma.incomingTransfer.count({ where }),
    ]);

    // The student and course behind a matched row, and the student behind a
    // known address — both read in bulk. A per-row include would be two joins
    // on every row of a list that is mostly neither.
    const submissionIds = rows
      .map((row) => row.matchedSubmissionId)
      .filter((id): id is string => id !== null);
    const orderIds = rows
      .map((row) => row.matchedBookOrderId)
      .filter((id): id is string => id !== null);
    const handles = rows
      .map((row) => row.senderHandle)
      .filter((handle): handle is string => handle !== null);

    const [submissions, orders, addresses] = await Promise.all([
      submissionIds.length === 0
        ? []
        : this.prisma.paymentSubmission.findMany({
            where: { id: { in: submissionIds } },
            select: { id: true, user: { select: { name: true } }, course: { select: { title: true } } },
          }),
      orderIds.length === 0
        ? []
        : this.prisma.bookOrder.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, user: { select: { name: true } } },
          }),
      handles.length === 0
        ? []
        : this.prisma.studentPaymentAddress.findMany({
            where: { handle: { in: handles } },
            select: { handle: true, user: { select: { name: true } } },
          }),
    ]);

    return {
      rows: rows.map((row) => {
        const submission = submissions.find((candidate) => candidate.id === row.matchedSubmissionId);
        const order = orders.find((candidate) => candidate.id === row.matchedBookOrderId);
        const address = addresses.find((candidate) => candidate.handle === row.senderHandle);
        return {
          id: row.id,
          source: row.source,
          amountCents: row.amountCents,
          senderHandle: row.senderHandle,
          // Whose address this is, when the platform has learned it — the
          // difference between «تحويل من مجهول» and «تحويل من أحمد، بس مش
          // طالب حاجة».
          senderStudentName: address?.user.name ?? null,
          rawLine: row.rawLine,
          receivedAt: row.receivedAt.toISOString(),
          matchedSubmissionId: row.matchedSubmissionId,
          matchedBookOrderId: row.matchedBookOrderId,
          // A guest book order has no account behind it, so no name — the row
          // still says a book was paid for, which is the useful half.
          matchedStudentName: submission?.user.name ?? order?.user?.name ?? null,
          matchedCourseTitle: submission?.course.title ?? null,
          dismissedAt: row.dismissedAt?.toISOString() ?? null,
        };
      }),
      rowCount,
    };
  }

  /** «شفتها، مش محتاجة حاجة» — a transfer an admin has accounted for outside
   *  the platform. Stamped, never deleted: the row is still the record that
   *  money arrived. */
  async dismiss(adminId: string, transferId: string): Promise<void> {
    await this.prisma.incomingTransfer.updateMany({
      where: { id: transferId, dismissedAt: null },
      data: { dismissedAt: new Date() },
    });

    await this.audit.record({
      action: 'transfer:dismiss',
      resourceType: AUDIT_RESOURCES.incomingTransfer,
      resourceId: transferId,
      actorUserId: adminId,
      outcome: 'success',
    });
  }
}

/**
 * How far back an amount already on the ledger is taken to be the same money.
 *
 * Thirty days: long enough that a notification list pasted in every day for a
 * week stops re-reporting the same transfers, and long enough to absorb the
 * SMS and the push that both announce one payment.
 */
const DEDUPE_DAYS = 30;

/**
 * How long before a claim a transfer may have arrived and still be taken as
 * the payment for it.
 *
 * Three days, and generous on purpose: this window only ever decides whether
 * an address is LEARNED, never whether access is granted — the admin has
 * already granted it by hand. Being wrong here costs a wrong address, which
 * is why the caller also refuses to act on more than one candidate.
 */
const LEARN_WINDOW_DAYS = 3;

/** Prisma's unique-constraint code, narrowed by shape rather than by importing
 *  the error class: the generated client's error types are not part of its
 *  public surface. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
