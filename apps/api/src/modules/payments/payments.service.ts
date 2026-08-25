import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PaymentSubmission, SubmitPaymentInput } from '@ayman/contracts/payments';
import type { AdminPaymentQuery, AdminPaymentRow, RejectPaymentInput } from '@ayman/contracts/admin/payments';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { MediaService, type UploadFile } from '../media/media.service';

/** The prefix `POST /payments/screenshot` stores under — see the model note
 *  on `PaymentSubmission.screenshotKey` in schema.prisma for why this must
 *  never be served through the public `/media/:prefix/:name` route. */
const SCREENSHOT_PREFIX = 'payment-proof';

/**
 * `d + n` months, clamped to the LAST DAY of the target month rather than
 * rolling into the month after.
 *
 * `Date.setMonth` overflows by design — 31 Jan + 1 month lands on 3 Mar in a
 * non-leap year, because February has no 31st and JS resolves that by
 * spilling the extra two days forward. For a subscription that reads as the
 * platform quietly handing out two free days on every month-end signup, and
 * doing it again every renewal. Clamping to the month's real last day is the
 * conventional fix and the only one that keeps "same day next month" true for
 * every day it can be true for.
 */
function addMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const daysInTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, daysInTargetMonth));
  return result;
}

const PLAN_MONTHS: Record<'monthly' | 'quarterly', number> = { monthly: 1, quarterly: 3 };

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly media: MediaService,
  ) {}

  /** Step one of the two-step upload — see the header note in `payments.ts`. */
  async uploadScreenshot(file: UploadFile): Promise<{ screenshotKey: string }> {
    const image = await this.media.uploadPrivateImage(file, SCREENSHOT_PREFIX);
    return { screenshotKey: image.storageKey };
  }

  /** Step two — the actual claim, referencing the key from step one. */
  async submit(userId: string, input: SubmitPaymentInput): Promise<PaymentSubmission> {
    if (!input.screenshotKey.startsWith(`${SCREENSHOT_PREFIX}/`)) {
      // Not an authorization check — `uploadPrivateImage` already scoped the
      // bytes to a key no OTHER route can serve. This only refuses a caller
      // who skipped step one and handed back a key from an unrelated feature
      // (a message attachment, a course cover), which would otherwise create
      // a submission an admin approves by looking at someone else's picture.
      throw new BadRequestException('screenshotKey was not issued by POST /payments/screenshot');
    }

    const course = await this.prisma.course.findUnique({
      where: { id: input.courseId },
      select: {
        id: true,
        title: true,
        status: true,
        monthlyPriceCents: true,
        quarterlyPriceCents: true,
      },
    });
    if (!course || course.status !== 'published') throw new NotFoundException();

    const planPriceCents =
      input.plan === 'monthly' ? course.monthlyPriceCents : course.quarterlyPriceCents;
    if (planPriceCents === null) {
      throw new BadRequestException('this course does not sell that plan');
    }

    // One outstanding claim per course at a time — see the model doc's note
    // on why approval EXTENDS a grant rather than stacking many; a second
    // pending submission for the same course would just be a second claim
    // racing the first for the same seat.
    const pending = await this.prisma.paymentSubmission.findFirst({
      where: { userId, courseId: input.courseId, status: 'pending' },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException('a submission for this course is already under review');
    }

    const submission = await this.prisma.paymentSubmission.create({
      data: {
        userId,
        courseId: input.courseId,
        plan: input.plan,
        amountCents: input.amountCents,
        screenshotKey: input.screenshotKey,
      },
    });

    await this.audit.record({
      action: 'payment:submit',
      resourceType: AUDIT_RESOURCES.paymentSubmission,
      resourceId: submission.id,
      outcome: 'success',
      metadata: { courseId: input.courseId, plan: input.plan, amountCents: input.amountCents },
    });

    return {
      id: submission.id,
      courseId: course.id,
      courseTitle: course.title,
      plan: submission.plan,
      amountCents: submission.amountCents,
      status: submission.status,
      rejectionReason: null,
      validUntil: null,
      createdAt: submission.createdAt.toISOString(),
    };
  }

  /** The caller's own claims, newest first. `userId` from the session, never the URL. */
  async listMine(userId: string): Promise<PaymentSubmission[]> {
    const rows = await this.prisma.paymentSubmission.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        plan: true,
        amountCents: true,
        status: true,
        rejectionReason: true,
        createdAt: true,
        course: { select: { id: true, title: true } },
        grant: { select: { validUntil: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      courseId: row.course.id,
      courseTitle: row.course.title,
      plan: row.plan,
      amountCents: row.amountCents,
      status: row.status,
      rejectionReason: row.rejectionReason,
      // The grant's CURRENT validUntil, not a value frozen at approval time —
      // a student renewing before expiry extends one grant (see the model
      // doc), so every one of their approved submissions for this course
      // should read the same, up-to-date "valid until", not the term each
      // individual payment purchased on its own.
      validUntil: row.grant?.validUntil?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async adminList(query: AdminPaymentQuery): Promise<{ rows: AdminPaymentRow[]; rowCount: number }> {
    const where = query.status ? { status: query.status } : {};

    const [rowCount, rows] = await this.prisma.$transaction([
      this.prisma.paymentSubmission.count({ where }),
      this.prisma.paymentSubmission.findMany({
        where,
        // Oldest pending first — a review queue is a support ticket queue.
        orderBy: [{ createdAt: 'asc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        select: {
          id: true,
          userId: true,
          plan: true,
          amountCents: true,
          status: true,
          rejectionReason: true,
          createdAt: true,
          reviewedAt: true,
          course: { select: { id: true, title: true } },
          user: { select: { name: true, email: true, phoneNumber: true } },
        },
      }),
    ]);

    const userIds = [...new Set(rows.map((row) => row.userId))];
    // Bulk, not per-row: `approvedBefore` needs every approved submission
    // for every student on this PAGE, and a query per row would turn a
    // 20-row page into 21 round trips.
    const approvedHistory =
      userIds.length === 0
        ? []
        : await this.prisma.paymentSubmission.findMany({
            where: { userId: { in: userIds }, status: 'approved' },
            select: { userId: true, createdAt: true },
          });

    return {
      rowCount,
      rows: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        studentName: row.user.name,
        studentEmail: row.user.email,
        studentPhone: row.user.phoneNumber,
        courseId: row.course.id,
        courseTitle: row.course.title,
        plan: row.plan,
        amountCents: row.amountCents,
        status: row.status,
        rejectionReason: row.rejectionReason,
        approvedBefore: approvedHistory.filter(
          (entry) => entry.userId === row.userId && entry.createdAt < row.createdAt,
        ).length,
        createdAt: row.createdAt.toISOString(),
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
      })),
    };
  }

  /** The screenshot's storage key, for the gated admin download route. */
  async screenshotKeyFor(submissionId: string): Promise<string> {
    const row = await this.prisma.paymentSubmission.findUnique({
      where: { id: submissionId },
      select: { screenshotKey: true },
    });
    if (!row) throw new NotFoundException();
    return row.screenshotKey;
  }

  /**
   * Approves the claim: extends (or creates) the one `purchase` grant for
   * this course, activates the enrollment, and notifies the student — all in
   * one transaction, so a submission is never left `approved` with no grant
   * behind it. See the model doc on `PaymentSubmission` for why this extends
   * rather than stacks.
   */
  async approve(
    adminId: string,
    submissionId: string,
  ): Promise<{ id: string; status: 'approved'; validUntil: string }> {
    const submission = await this.prisma.paymentSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, userId: true, courseId: true, plan: true, status: true },
    });
    if (!submission) throw new NotFoundException();
    if (submission.status !== 'pending') {
      throw new ConflictException('this submission was already reviewed');
    }

    const existingGrant = await this.prisma.accessGrant.findFirst({
      where: {
        userId: submission.userId,
        courseId: submission.courseId,
        scope: 'course',
        source: 'purchase',
        revokedAt: null,
      },
      select: { id: true, validUntil: true },
    });

    const now = new Date();
    const baseline =
      existingGrant?.validUntil && existingGrant.validUntil > now ? existingGrant.validUntil : now;
    const validUntil = addMonthsClamped(baseline, PLAN_MONTHS[submission.plan]);

    const grantId = await this.prisma.$transaction(async (tx) => {
      const grant = existingGrant
        ? await tx.accessGrant.update({
            where: { id: existingGrant.id },
            data: { validUntil },
            select: { id: true },
          })
        : await tx.accessGrant.create({
            data: {
              userId: submission.userId,
              courseId: submission.courseId,
              scope: 'course',
              source: 'purchase',
              grantedByUserId: adminId,
              validFrom: now,
              validUntil,
              note: `purchase: submission ${submission.id}`,
            },
            select: { id: true },
          });

      await tx.enrollment.upsert({
        where: { userId_courseId: { userId: submission.userId, courseId: submission.courseId } },
        create: { userId: submission.userId, courseId: submission.courseId, source: 'purchase' },
        // Reactivates a `revoked`/`suspended` enrollment from an earlier
        // subscription lapse — the same door `AdminStudentsService
        // .grantCourse` opens for a manual grant, here for a paid one.
        update: { status: 'active', source: 'purchase' },
      });

      await tx.paymentSubmission.update({
        where: { id: submission.id },
        data: {
          status: 'approved',
          reviewedByUserId: adminId,
          reviewedAt: now,
          grantId: grant.id,
        },
      });

      await this.notifications.emit(tx, {
        userId: submission.userId,
        kind: 'payment_approved',
        courseId: submission.courseId,
        validUntil: validUntil.toISOString(),
      });

      return grant.id;
    });

    await this.audit.record({
      action: 'payment:approve',
      resourceType: AUDIT_RESOURCES.paymentSubmission,
      resourceId: submission.id,
      outcome: 'success',
      // `.toISOString()`, not the bare `Date` — `chainHash` canonicalises
      // whatever object shape it is GIVEN, and a raw `Date` has no own
      // enumerable properties, so it hashes as `{}`. Prisma's own JSON
      // encoder still converts it to the same ISO string it always would
      // have (`Date.prototype.toJSON`), so the row that gets STORED and the
      // payload that got HASHED silently diverge — `verifyChain` catches the
      // mismatch on this row specifically, arbitrarily far downstream.
      metadata: {
        userId: submission.userId,
        courseId: submission.courseId,
        grantId,
        validUntil: validUntil.toISOString(),
      },
    });

    return { id: submission.id, status: 'approved', validUntil: validUntil.toISOString() };
  }

  async reject(adminId: string, submissionId: string, input: RejectPaymentInput): Promise<void> {
    const submission = await this.prisma.paymentSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, userId: true, courseId: true, status: true },
    });
    if (!submission) throw new NotFoundException();
    if (submission.status !== 'pending') {
      throw new ConflictException('this submission was already reviewed');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentSubmission.update({
        where: { id: submission.id },
        data: {
          status: 'rejected',
          rejectionReason: input.reason,
          reviewedByUserId: adminId,
          reviewedAt: new Date(),
        },
      });

      await this.notifications.emit(tx, {
        userId: submission.userId,
        kind: 'payment_rejected',
        courseId: submission.courseId,
        reason: input.reason,
      });
    });

    await this.audit.record({
      action: 'payment:reject',
      resourceType: AUDIT_RESOURCES.paymentSubmission,
      resourceId: submission.id,
      outcome: 'success',
      metadata: { userId: submission.userId, courseId: submission.courseId, reason: input.reason },
    });
  }
}
