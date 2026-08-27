import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PaymentSubmission, SubmitPaymentInput } from '@ayman/contracts/payments';
import type {
  AdminManualSubscribe,
  AdminPaymentQuery,
  AdminPaymentRow,
  AdminSubscriptionRow,
  RejectPaymentInput,
} from '@ayman/contracts/admin/payments';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { MediaService, type UploadFile } from '../media/media.service';
import type { Prisma } from '../../generated/prisma/client';
import { computeApprovalValidUntil, type PaymentPlan as CourseWidePlan } from './payment-expiry';
import { amountCollectedCents } from './finance-status';

/** The prefix `POST /payments/screenshot` stores under — see the model note
 *  on `PaymentSubmission.screenshotKey` in schema.prisma for why this must
 *  never be served through the public `/media/:prefix/:name` route. */
const SCREENSHOT_PREFIX = 'payment-proof';

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
        terms: { select: { id: true, title: true, isOpen: true, priceCents: true } },
      },
    });
    if (!course || course.status !== 'published') throw new NotFoundException();

    // `SubmitPaymentSchema`'s own `.refine()` already guarantees `termId` is
    // set exactly when `plan = 'term'` — this is the courseId-scoped lookup
    // that turns "some uuid" into "a real, currently-OPEN term of THIS
    // course", the one thing the shared schema cannot check on its own.
    const term = input.plan === 'term'
      ? (course.terms.find((candidate) => candidate.id === input.termId) ?? null)
      : null;
    if (input.plan === 'term' && (term === null || !term.isOpen)) {
      throw new BadRequestException('this term is not open for subscription');
    }

    const planPriceCents =
      input.plan === 'monthly'
        ? course.monthlyPriceCents
        : input.plan === 'quarterly'
          ? course.quarterlyPriceCents
          : (term?.priceCents ?? null);
    if (planPriceCents === null) {
      throw new BadRequestException('this course does not sell that plan');
    }

    // One outstanding claim per course at a time — see the model doc's note
    // on why approval EXTENDS a grant rather than stacking many; a second
    // pending submission for the same course would just be a second claim
    // racing the first for the same seat. Deliberately still scoped to the
    // whole COURSE, not the term: a student with a pending term-A claim
    // trying to also submit for term B is the same "wait for the first
    // review" situation, not an independent one.
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
        termId: term?.id ?? null,
        // The plan's OWN price, not anything the student typed — see the
        // model note on `amountCents` for why this stopped being input.
        amountCents: planPriceCents,
        senderPhone: input.senderPhone,
        screenshotKey: input.screenshotKey,
      },
    });

    await this.audit.record({
      action: 'payment:submit',
      resourceType: AUDIT_RESOURCES.paymentSubmission,
      resourceId: submission.id,
      outcome: 'success',
      metadata: { courseId: input.courseId, plan: input.plan, termId: term?.id ?? null, amountCents: planPriceCents },
    });

    return {
      id: submission.id,
      courseId: course.id,
      courseTitle: course.title,
      plan: submission.plan,
      termId: term?.id ?? null,
      termTitle: term?.title ?? null,
      amountCents: submission.amountCents,
      senderPhone: submission.senderPhone,
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
        senderPhone: true,
        status: true,
        rejectionReason: true,
        createdAt: true,
        course: { select: { id: true, title: true } },
        term: { select: { id: true, title: true } },
        grant: { select: { validUntil: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      courseId: row.course.id,
      courseTitle: row.course.title,
      plan: row.plan,
      termId: row.term?.id ?? null,
      termTitle: row.term?.title ?? null,
      amountCents: row.amountCents,
      senderPhone: row.senderPhone,
      status: row.status,
      rejectionReason: row.rejectionReason,
      // The grant's CURRENT validUntil, not a value frozen at approval time —
      // a student renewing before expiry extends one grant (see the model
      // doc), so every one of their approved submissions for this course
      // should read the same, up-to-date "valid until", not the term each
      // individual payment purchased on its own. Always `null` for a `plan:
      // 'term'` row, same as the grant behind it.
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
          senderPhone: true,
          screenshotKey: true,
          isFree: true,
          status: true,
          rejectionReason: true,
          createdAt: true,
          reviewedAt: true,
          course: { select: { id: true, title: true } },
          term: { select: { id: true, title: true } },
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
        termId: row.term?.id ?? null,
        termTitle: row.term?.title ?? null,
        amountCents: row.amountCents,
        senderPhone: row.senderPhone,
        isFree: row.isFree,
        hasScreenshot: row.screenshotKey !== null,
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

  /**
   * The screenshot's storage key, for the gated admin download route.
   *
   * 404s on a submission with no screenshot at all — the normal state for a
   * row `adminManualSubscribe` created directly, see the model note on
   * `PaymentSubmission.screenshotKey` — same status a nonexistent submission
   * id gets, since there is equally nothing to stream back either way. The
   * web side is expected to check `AdminPaymentRow.hasScreenshot` before ever
   * requesting this route, so reaching this branch means it did not.
   */
  async screenshotKeyFor(submissionId: string): Promise<string> {
    const row = await this.prisma.paymentSubmission.findUnique({
      where: { id: submissionId },
      select: { screenshotKey: true },
    });
    if (!row || row.screenshotKey === null) throw new NotFoundException();
    return row.screenshotKey;
  }

  /**
   * The shared date math behind BOTH ways a `purchase` grant is created or
   * extended: a genuine `approve()` and an admin's own `adminManualSubscribe`.
   * Reads the one live grant (if any) and computes what its new `validUntil`
   * would be — outside any transaction, same as `approve()` always did, so
   * this carries the exact same read-then-write window that method already
   * had rather than introducing a new one.
   */
  private async resolvePurchaseExpiry(
    userId: string,
    courseId: string,
    plan: CourseWidePlan,
    now: Date,
  ): Promise<{ existingGrant: { id: string } | null; validUntil: Date }> {
    const existingGrant = await this.prisma.accessGrant.findFirst({
      where: { userId, courseId, scope: 'course', source: 'purchase', revokedAt: null },
      select: { id: true, validUntil: true },
    });
    const validUntil = computeApprovalValidUntil(plan, now, existingGrant?.validUntil ?? null);
    return { existingGrant: existingGrant ? { id: existingGrant.id } : null, validUntil };
  }

  /**
   * The write half: creates or extends the ONE live `purchase` grant for this
   * course, and (re)activates the enrollment behind it. Shared by `approve()`
   * and `adminManualSubscribe()` so the two paths can never quietly diverge
   * on what "a subscription took effect" actually writes — see the model
   * doc on `PaymentSubmission` for why approval extends one grant rather
   * than stacking many.
   */
  private async writePurchaseGrant(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      courseId: string;
      adminId: string;
      now: Date;
      validUntil: Date;
      existingGrant: { id: string } | null;
      note: string;
    },
  ): Promise<string> {
    const grant = params.existingGrant
      ? await tx.accessGrant.update({
          where: { id: params.existingGrant.id },
          data: { validUntil: params.validUntil },
          select: { id: true },
        })
      : await tx.accessGrant.create({
          data: {
            userId: params.userId,
            courseId: params.courseId,
            scope: 'course',
            source: 'purchase',
            grantedByUserId: params.adminId,
            validFrom: params.now,
            validUntil: params.validUntil,
            note: params.note,
          },
          select: { id: true },
        });

    await tx.enrollment.upsert({
      where: { userId_courseId: { userId: params.userId, courseId: params.courseId } },
      create: { userId: params.userId, courseId: params.courseId, source: 'purchase' },
      // Reactivates a `revoked`/`suspended` enrollment from an earlier
      // subscription lapse — the same door `AdminStudentsService
      // .grantCourse` opens for a manual grant, here for a paid one.
      update: { status: 'active', source: 'purchase' },
    });

    return grant.id;
  }

  /**
   * The term-scoped counterpart of `writePurchaseGrant` — deliberately NOT
   * folded into it, because a `scope: term` grant does not behave like a
   * `scope: course` one: it is never date-extended (`validUntil` always
   * `null`, see the model doc), and there can legitimately be several LIVE
   * ones for the same student on the same course at once, one per term.
   *
   * Reuses a still-live grant for the SAME term rather than creating a
   * second one — a student re-submitting for a term they already hold is a
   * no-op on the grant, same principle as `writePurchaseGrant` extending
   * rather than stacking. A previously REVOKED grant (the term was closed
   * and reopened, or the student was individually revoked) is deliberately
   * left alone and a fresh row is created instead — `revokedAt` is
   * permanent everywhere else in this schema, and un-revoking one here would
   * be the one place that stopped being true.
   */
  private async writeTermGrant(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      courseId: string;
      termId: string;
      adminId: string;
      now: Date;
      note: string;
    },
  ): Promise<string> {
    const existing = await tx.accessGrant.findFirst({
      where: {
        userId: params.userId,
        courseId: params.courseId,
        termId: params.termId,
        scope: 'term',
        revokedAt: null,
      },
      select: { id: true },
    });

    const grantId =
      existing?.id ??
      (
        await tx.accessGrant.create({
          data: {
            userId: params.userId,
            courseId: params.courseId,
            termId: params.termId,
            scope: 'term',
            source: 'purchase',
            grantedByUserId: params.adminId,
            validFrom: params.now,
            validUntil: null,
            note: params.note,
          },
          select: { id: true },
        })
      ).id;

    await tx.enrollment.upsert({
      where: { userId_courseId: { userId: params.userId, courseId: params.courseId } },
      create: { userId: params.userId, courseId: params.courseId, source: 'purchase' },
      update: { status: 'active', source: 'purchase' },
    });

    return grantId;
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
  ): Promise<{ id: string; status: 'approved'; validUntil: string | null }> {
    const submission = await this.prisma.paymentSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, userId: true, courseId: true, plan: true, termId: true, status: true },
    });
    if (!submission) throw new NotFoundException();
    if (submission.status !== 'pending') {
      throw new ConflictException('this submission was already reviewed');
    }

    const now = new Date();
    // `term` is not date-extended at all (see `writeTermGrant`'s own note),
    // so it skips `resolvePurchaseExpiry` entirely rather than computing an
    // expiry nothing will read.
    const { existingGrant, validUntil } =
      submission.plan === 'term'
        ? { existingGrant: null, validUntil: null }
        : await this.resolvePurchaseExpiry(submission.userId, submission.courseId, submission.plan, now);

    const grantId = await this.prisma.$transaction(async (tx) => {
      const grantId =
        submission.plan === 'term'
          ? await this.writeTermGrant(tx, {
              userId: submission.userId,
              courseId: submission.courseId,
              // Guaranteed non-null for `plan: 'term'` — `submit()` never
              // creates one without it (see `SubmitPaymentSchema`'s refine).
              termId: submission.termId as string,
              adminId,
              now,
              note: `purchase: submission ${submission.id}`,
            })
          : await this.writePurchaseGrant(tx, {
              userId: submission.userId,
              courseId: submission.courseId,
              adminId,
              now,
              // Non-null in this branch — only `term` ever leaves it null.
              validUntil: validUntil as Date,
              existingGrant,
              note: `purchase: submission ${submission.id}`,
            });

      await tx.paymentSubmission.update({
        where: { id: submission.id },
        data: {
          status: 'approved',
          reviewedByUserId: adminId,
          reviewedAt: now,
          grantId,
        },
      });

      await this.notifications.emit(tx, {
        userId: submission.userId,
        kind: 'payment_approved',
        courseId: submission.courseId,
        validUntil: validUntil ? validUntil.toISOString() : null,
      });

      return grantId;
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
        termId: submission.termId,
        grantId,
        validUntil: validUntil ? validUntil.toISOString() : null,
      },
    });

    return {
      id: submission.id,
      status: 'approved',
      validUntil: validUntil ? validUntil.toISOString() : null,
    };
  }

  /**
   * The admin student page's own entry point — recording a payment that
   * already happened OUTSIDE this review flow (a WhatsApp transfer he
   * already received), or comping a term for free. Reaches EXACTLY the same
   * `AccessGrant`/`Enrollment` state `approve()` would: same
   * `resolvePurchaseExpiry`/`writePurchaseGrant`, so the two paths can never
   * silently compute a different expiry for what is, underneath, the same
   * operation.
   *
   * A `PaymentSubmission` is created ALREADY `approved` (never `pending`) —
   * there is nothing for anyone to review, the admin reviewing it IS the
   * event. It still creates one at all so `/admin/finance` and
   * `/admin/payments` keep working unmodified: both already read a course's
   * money history off `PaymentSubmission`, and a grant with no submission
   * behind it would be invisible to both, or would need a second, divergent
   * read path just for this case.
   */
  async adminManualSubscribe(
    adminId: string,
    userId: string,
    input: AdminManualSubscribe,
  ): Promise<AdminSubscriptionRow[]> {
    if (input.screenshotKey !== null && !input.screenshotKey.startsWith(`${SCREENSHOT_PREFIX}/`)) {
      // Same guard `submit()` runs on the student-facing upload — a key from
      // an unrelated feature (a course cover, a message attachment) would
      // otherwise let this admin route attach someone else's picture as
      // "proof" of this payment.
      throw new BadRequestException('screenshotKey was not issued by POST /payments/screenshot');
    }

    const [student, course] = await Promise.all([
      this.prisma.studentProfile.findUnique({ where: { userId }, select: { userId: true } }),
      this.prisma.course.findUnique({
        where: { id: input.courseId },
        select: {
          id: true,
          status: true,
          monthlyPriceCents: true,
          quarterlyPriceCents: true,
          terms: { select: { id: true, title: true, priceCents: true } },
        },
      }),
    ]);
    if (!student || !course || course.status !== 'published') throw new NotFoundException();

    // `AdminManualSubscribeSchema`'s own `.refine()` guarantees `termId` is
    // set exactly when `plan = 'term'`. Deliberately NOT gated on
    // `term.isOpen`, unlike `submit()` — this is the admin override, same
    // precedent as `CourseAccessSection` letting an admin open a course
    // regardless of the automatic rule.
    const term = input.plan === 'term'
      ? (course.terms.find((candidate) => candidate.id === input.termId) ?? null)
      : null;
    if (input.plan === 'term' && term === null) throw new NotFoundException();

    const planPriceCents =
      input.plan === 'monthly'
        ? course.monthlyPriceCents
        : input.plan === 'quarterly'
          ? course.quarterlyPriceCents
          : (term?.priceCents ?? null);
    if (planPriceCents === null) {
      throw new BadRequestException('this course does not sell that plan');
    }

    const now = new Date();
    const { existingGrant, validUntil } =
      input.plan === 'term'
        ? { existingGrant: null, validUntil: null }
        : await this.resolvePurchaseExpiry(userId, input.courseId, input.plan, now);
    const amountCents = amountCollectedCents(planPriceCents, input.isFree);

    const submissionId = await this.prisma.$transaction(async (tx) => {
      const grantId =
        input.plan === 'term'
          ? await this.writeTermGrant(tx, {
              userId,
              courseId: input.courseId,
              // Non-null here — guaranteed above by the schema refine plus
              // the `term === null` guard.
              termId: (term as { id: string }).id,
              adminId,
              now,
              note: `manual: recorded by admin ${adminId}`,
            })
          : await this.writePurchaseGrant(tx, {
              userId,
              courseId: input.courseId,
              adminId,
              now,
              validUntil: validUntil as Date,
              existingGrant,
              note: `manual: recorded by admin ${adminId}`,
            });

      const submission = await tx.paymentSubmission.create({
        data: {
          userId,
          courseId: input.courseId,
          plan: input.plan,
          termId: term?.id ?? null,
          amountCents,
          isFree: input.isFree,
          // Neither has a meaningful value for a row the admin creates
          // directly — see the model notes on both columns.
          senderPhone: null,
          screenshotKey: input.screenshotKey,
          status: 'approved',
          reviewedByUserId: adminId,
          reviewedAt: now,
          grantId,
        },
        select: { id: true },
      });

      // Same notification a genuine approval sends — the student gained
      // real access either way, and deserves to hear about it the same way.
      await this.notifications.emit(tx, {
        userId,
        kind: 'payment_approved',
        courseId: input.courseId,
        validUntil: validUntil ? validUntil.toISOString() : null,
      });

      return submission.id;
    });

    await this.audit.record({
      action: 'payment:admin-subscribe',
      resourceType: AUDIT_RESOURCES.paymentSubmission,
      resourceId: submissionId,
      outcome: 'success',
      metadata: {
        userId,
        courseId: input.courseId,
        plan: input.plan,
        termId: term?.id ?? null,
        isFree: input.isFree,
        amountCents,
        validUntil: validUntil ? validUntil.toISOString() : null,
      },
    });

    return this.adminListSubscriptions(userId);
  }

  /**
   * Closes a manually-issued (or genuinely paid) subscription — by STAMPING
   * `revokedAt`, never a delete, same convention as `AdminStudentsService
   * .revokeGrant`.
   *
   * Deliberately does NOT touch `Enrollment.status`, unlike that method's own
   * revoke: this grant's course is `requiresGrant` (every priced course is,
   * by the `courses_priced_requires_grant` constraint), but the door that
   * actually closes on it is the SAME one a `validUntil` lapsing already
   * walks through with no enrollment change at all — `EntitlementService
   * .resolveCourseAccess` reports `revoked`, and `LessonAccessService
   * .require`'s live re-check (added alongside subscription expiry
   * enforcement) throws on exactly that reason. Touching the enrollment here
   * too would make a MANUAL cancellation behave differently from an ordinary
   * one lapsing on its own, for no benefit.
   */
  async adminCancelSubscription(
    adminId: string,
    userId: string,
    grantId: string,
  ): Promise<AdminSubscriptionRow[]> {
    const grant = await this.prisma.accessGrant.findFirst({
      // `userId` in the WHERE, so a grant id from another student's account
      // cannot be cancelled through this student's URL. `scope: 'term'`
      // included alongside `'course'` — this is the same manual-subscribe
      // section's own cancel button, for either kind of grant it can create.
      where: { id: grantId, userId, scope: { in: ['course', 'term'] }, source: 'purchase' },
      select: { id: true, revokedAt: true, courseId: true },
    });
    if (!grant) throw new NotFoundException();

    const alreadyRevoked = grant.revokedAt !== null;
    if (!alreadyRevoked) {
      await this.prisma.accessGrant.update({
        where: { id: grant.id },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit.record({
      action: 'payment:admin-cancel-subscription',
      resourceType: 'access_grant',
      resourceId: grant.id,
      outcome: 'success',
      metadata: { userId, courseId: grant.courseId, alreadyRevoked, adminId },
    });

    return this.adminListSubscriptions(userId);
  }

  /**
   * One row per course- or term-scoped `purchase` grant this student holds or
   * once held — the admin student page's manual-subscribe section. A revoked
   * one stays on screen for the same reason `CourseAccessSection`'s own list
   * keeps its revoked rows: "why can't this student open this course (or
   * term) any more" is only answerable if the answer is still visible.
   */
  async adminListSubscriptions(userId: string): Promise<AdminSubscriptionRow[]> {
    const grants = await this.prisma.accessGrant.findMany({
      where: { userId, scope: { in: ['course', 'term'] }, source: 'purchase' },
      // Live ones first, soonest-expiring first within each group — the
      // subscription most worth a glance leads, same convention as the
      // finance screen's own ordering. A `null` `validUntil` (every term
      // grant) sorts last within its group, which is fine: it is never
      // "soonest to expire" in the first place.
      orderBy: [{ revokedAt: 'asc' }, { validUntil: 'asc' }, { id: 'desc' }],
      select: {
        id: true,
        courseId: true,
        termId: true,
        validUntil: true,
        revokedAt: true,
        createdAt: true,
        course: { select: { title: true } },
        term: { select: { title: true } },
        // The most recent APPROVED submission behind this grant — see
        // `FinanceService.list`'s identical join for why `take: 1` is
        // correct here too.
        paymentSubmissions: {
          where: { status: 'approved' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { plan: true, amountCents: true, isFree: true },
        },
      },
    });

    return grants
      // `scope: { in: ['course', 'term'] }` guarantees `courseId`/`course`,
      // but the type system cannot see that — same defensive filter
      // `FinanceService.list` uses.
      .filter(
        (grant): grant is typeof grant & { courseId: string; course: { title: string } } =>
          grant.courseId !== null && grant.course !== null,
      )
      .map((grant) => {
        const latest = grant.paymentSubmissions[0] ?? null;
        return {
          id: grant.id,
          courseId: grant.courseId,
          courseTitle: grant.course.title,
          plan: latest?.plan ?? null,
          termId: grant.termId,
          termTitle: grant.term?.title ?? null,
          amountCents: latest?.amountCents ?? null,
          isFree: latest?.isFree ?? null,
          validUntil: grant.validUntil?.toISOString() ?? null,
          revokedAt: grant.revokedAt?.toISOString() ?? null,
          createdAt: grant.createdAt.toISOString(),
        };
      });
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
