import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PaymentSubmission, SubmitPaymentInput } from '@ayman/contracts/payments';
// A RUNTIME import, so it comes off the subpath and never the root barrel —
// see `packages/contracts`'s own note on why the barrel cannot boot the API.
import { SellablePaymentPlanSchema } from '@ayman/contracts/months';
import type {
  AdminManualSubscribe,
  AdminPaymentQuery,
  AdminPaymentRow,
  AdminPaymentSort,
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
import { resolvePlanPriceCents } from './plan-price';
import {
  checkMonthSelection,
  monthPurchaseAmountCents,
  monthSelectionMessage,
  pendingClaimsBlocking,
  monthlyPlanOnSale,
} from './month-grants';
// Pure readers, not injected services — `PaymentsModule` is not widened for
// them and `EntitlementService` is not reachable from here. They are imported
// so that «إيه اللي الطالب ده فاتحه أصلًا» has ONE definition: the checkout
// must not offer (or charge for) a month the gate would have opened anyway.
import { courseAccessScopes } from '../entitlement/grant-liveness';
import { monthSliceOf } from '../entitlement/month-access';

/** The prefix `POST /payments/screenshot` stores under — see the model note
 *  on `PaymentSubmission.screenshotKey` in schema.prisma for why this must
 *  never be served through the public `/media/:prefix/:name` route. */
const SCREENSHOT_PREFIX = 'payment-proof';

/** Thrown inside `approveFromTransfer`'s transaction when the claim or the
 *  transfer was settled by something else first, purely to roll the whole
 *  thing back. Never escapes the method — a lost race is a `null` return, not
 *  an error: the work was already done, correctly, by whoever won. */
class AlreadySettled extends Error {}

/** Just what `courseAccessScopes` and the month picker need off a course —
 *  a Prisma row from either caller, never the whole model. */
interface MonthOfferingCourse {
  id: string;
  subjectId: string;
  requiresGrant: boolean;
  months: readonly { id: string; isOpen: boolean }[];
}

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

    if (!SellablePaymentPlanSchema.safeParse(input.plan).success) {
      /*
        «٣ شهور» came off the shelf — the instructor took it off — and this is
        the ONLY door that enforces it.

        The enum value is not gone and must not be: `payment_submissions` and
        `access_grants` are full of quarterly rows, `/admin/finance` reports on
        them, a student who bought one still holds it, and
        `PaymentSubmissionSchema` still parses every one. Narrowing the READING
        schema instead would have thrown on perfectly valid history.

        `adminManualSubscribe` deliberately does NOT run this check: an admin
        recording a quarterly transfer that really happened, or correcting a
        row he entered wrong, is that history rule working — not a new sale.
      */
      throw new BadRequestException('this plan is no longer sold');
    }

    const course = await this.prisma.course.findUnique({
      where: { id: input.courseId },
      select: {
        id: true,
        title: true,
        status: true,
        // The rest of what `courseAccessScopes` needs, for the owned-months
        // read below — selected here so it costs no second round trip.
        subjectId: true,
        requiresGrant: true,
        monthlyPriceCents: true,
        quarterlyPriceCents: true,
        yearlyPriceCents: true,
        terms: { select: { id: true, title: true, isOpen: true, priceCents: true } },
        // EVERY month, open or not — `courseSellsByMonth` below is keyed on
        // the course having any at all, and `isOpen` then decides which of
        // them may be bought. Twelve rows at the very most (`month_index` is
        // 1..12 by CHECK), so this is not a list worth paginating.
        months: { select: { id: true, isOpen: true } },
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

    const planPriceCents = resolvePlanPriceCents(course, input.plan, term?.priceCents ?? null);
    if (planPriceCents === null) {
      throw new BadRequestException('this course does not sell that plan');
    }

    /*
      «الكورس ده بيتباع بالشهر؟» — the one fact that decides which of the two
      monthly products this claim is, and it is keyed on the course having ANY
      `CourseMonth` row rather than any OPEN one.

      `LessonAccessService.require` gates on exactly the same fact
      (`courseSellsByMonth = months.length > 0`). Keying this on "has an OPEN
      month" instead would let a course whose months the instructor had all
      closed go on SELLING the old course-wide thirty-day grant while the gate
      read it by month: that grant opens every lecture, `/admin/finance` calls
      it a monthly subscription, and no screen anywhere says the two halves
      disagree. With no open month there is simply nothing to buy, and the
      refusal below says so.

      A course with no months at all never enters any of this and takes the
      original path below, unchanged. That is the whole backward-compatibility
      story, and it is one `if`.
    */
    const courseSellsByMonth = course.months.length > 0;
    // `SubmitPaymentSchema` gives this a `.default([])`, so every request-borne
    // input carries it; a caller reaching the service directly (the specs next
    // door) may not, and a missing field should be "bought no months" rather
    // than a TypeError. Deduplicated for the same reason the schema refines
    // against duplicates and one layer further in: the same month twice would
    // DOUBLE the price below and then die on `payment_submission_months`'
    // primary key, having already told the student what to transfer.
    const requestedMonthIds = [...new Set(input.monthIds ?? [])];
    const isMonthPurchase = input.plan === 'monthly' && courseSellsByMonth;

    // The storefront no longer offers «شهر» when every month is closed
    // (`monthlyOnSale`), so this is a stale tab or a hand-written request —
    // refused here, before the month picker's own «pick at least one» reads as
    // the student's mistake.
    // (A course with no monthly price at all keeps its own refusal below.)
    if (
      isMonthPurchase &&
      course.monthlyPriceCents !== null &&
      !monthlyPlanOnSale(course.monthlyPriceCents, {
        total: course.months.length,
        open: course.months.filter((month) => month.isOpen).length,
      })
    ) {
      throw new BadRequestException('the monthly plan of this course is not open for subscription right now');
    }

    if (input.plan === 'monthly' && !courseSellsByMonth && requestedMonthIds.length > 0) {
      // The panel only sends months when `CatalogCourseDetail.months` came back
      // non-empty, so this is a stale tab or a hand-written request. The ids
      // name months of some OTHER course — writing them would put real money
      // against rows no gate on this course will ever read.
      throw new BadRequestException('this course does not sell by curriculum month');
    }

    if (isMonthPurchase) {
      const refusal = checkMonthSelection({
        requested: requestedMonthIds,
        // OPEN months only, matching what `CatalogService` published to the
        // picker — a month closed between the page rendering and «كمّل الدفع»
        // is the case this catches.
        onSale: new Set(course.months.filter((month) => month.isOpen).map((month) => month.id)),
        owned: new Set(await this.ownedMonthIds(userId, course)),
      });
      if (refusal) throw new BadRequestException(monthSelectionMessage(refusal));
    }

    // Server-side either way, never client input — see the model note on
    // `amountCents`. For months it is the course's own per-month price times
    // how many were chosen: one transfer can buy «شهر ٢ و٣».
    const amountCents = isMonthPurchase
      ? monthPurchaseAmountCents(planPriceCents, requestedMonthIds.length)
      : planPriceCents;

    /*
      One outstanding claim per course at a time — see the model doc's note on
      why approval EXTENDS a grant rather than stacking many; a second pending
      submission for the same course would just be a second claim racing the
      first for the same seat. Deliberately still scoped to the whole COURSE,
      not the term: a student with a pending term-A claim trying to also submit
      for term B is the same "wait for the first review" situation.

      A MONTH purchase is the one case where that argument does not hold —
      approval creates a grant PER MONTH and the months are disjoint — so it is
      narrowed to the actual overlap. `pendingClaimsBlocking` carries the whole
      reasoning, including why a pending claim naming NO months still blocks.
    */
    const pending = await this.prisma.paymentSubmission.findMany({
      where: { userId, courseId: input.courseId, status: 'pending' },
      select: { id: true, months: { select: { monthId: true } } },
    });
    const blocking = isMonthPurchase
      ? pendingClaimsBlocking(
          pending.map((claim) => ({
            id: claim.id,
            monthIds: claim.months.map((row) => row.monthId),
          })),
          requestedMonthIds,
        )
      : pending.map((claim) => claim.id);
    if (blocking.length > 0) {
      throw new ConflictException(
        isMonthPurchase
          ? 'a submission covering one of these months is already under review'
          : 'a submission for this course is already under review',
      );
    }

    /*
      The submission and the alert about it are ONE transaction.

      A row that nobody is told about is a student waiting on a queue no one
      knows has grown — «لما حد يعمل اشتراك يتبعتلي إشعار». Writing the
      notification separately, after the create, would leave exactly that state
      behind whenever the second write failed.
    */
    const { submission, admins } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.paymentSubmission.create({
        data: {
          userId,
          courseId: input.courseId,
          plan: input.plan,
          termId: term?.id ?? null,
          // Derived above, never anything the student typed — see the model
          // note on `amountCents` for why this stopped being input.
          amountCents,
          senderPhone: input.senderPhone,
          screenshotKey: input.screenshotKey,
        },
      });

      if (isMonthPurchase) {
        // Inside the SAME transaction as the submission, for a sharper reason
        // than the notification below: `approve()` reads THESE rows, not the
        // course, to decide what it is approving. A submission that committed
        // without them is a monthly claim for no months at all — and approval
        // would read it as the old course-wide plan and hand over the lot.
        await tx.paymentSubmissionMonth.createMany({
          data: requestedMonthIds.map((monthId) => ({
            submissionId: created.id,
            monthId,
            // Denormalised from both sides on purpose — it is what the
            // composite FK checks against. See the model doc.
            courseId: input.courseId,
          })),
        });
      }

      const recipients = await this.notifications.emitToPermission(
        tx,
        // The same permission that opens the review screen — see
        // `emitToPermission` for why this is not `role: 'admin'`.
        'payment:read',
        'payment_submitted',
        { submissionId: created.id, courseId: input.courseId },
      );

      return { submission: created, admins: recipients };
    });

    // AFTER the commit, never inside it. See `NotificationsService.announce`.
    await this.notifications.announceAll(admins);

    await this.audit.record({
      action: 'payment:submit',
      resourceType: AUDIT_RESOURCES.paymentSubmission,
      resourceId: submission.id,
      outcome: 'success',
      metadata: {
        courseId: input.courseId,
        plan: input.plan,
        termId: term?.id ?? null,
        // Empty on every claim but a month purchase. Recorded because it is
        // the only place the CHOICE survives an admin later editing the
        // amount on the finance screen.
        monthIds: requestedMonthIds,
        amountCents,
      },
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

  /**
   * «الشهور اللي معاه خلاص» — the months of this course, of those ON SALE,
   * that the student can already open.
   *
   * `GET /payments/courses/:courseId/months/mine`. The checkout disables a
   * card rather than hiding it («معاه اشتراك خلاص»), so this is a read the
   * picker makes before it lets anyone pay.
   *
   * Not gated on `status = 'published'`, unlike `submit()`: a student asking
   * what they already own in a course an admin has just unpublished deserves
   * the true answer, and there is nothing to sell them here to protect.
   */
  async listOwnedMonths(userId: string, courseId: string): Promise<{ ownedMonthIds: string[] }> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        subjectId: true,
        requiresGrant: true,
        months: { select: { id: true, isOpen: true } },
      },
    });
    if (!course) throw new NotFoundException();

    return { ownedMonthIds: await this.ownedMonthIds(userId, course) };
  }

  /**
   * The read behind both `listOwnedMonths` and `submit()`'s «معاه خلاص»
   * refusal — deliberately ONE method, because a checkout that computed
   * "owned" more narrowly than the screen showing it would take money for a
   * month the padlock was never on.
   *
   * Goes through `courseAccessScopes` + `monthSliceOf`, the exact pair
   * `EntitlementService.resolveMonthSlice` and `LessonGateService` draw the
   * outline with. A student holding a live YEARLY subscription owns every
   * month whether or not a `course_month` grant exists, and a query written
   * here against `scope: 'course_month'` alone would have missed that and
   * cheerfully sold them «شهر ٢» twice.
   *
   * `everything: true` collapses to every month ON SALE rather than every
   * month that exists: the question both callers ask is which CARDS are
   * already covered, and a closed month has no card.
   */
  private async ownedMonthIds(userId: string, course: MonthOfferingCourse): Promise<string[]> {
    const grants = await this.prisma.accessGrant.findMany({
      where: { userId, OR: courseAccessScopes(course) },
      select: { id: true, scope: true, monthId: true, validFrom: true, validUntil: true, revokedAt: true },
    });

    const slice = monthSliceOf(grants, new Date());
    const onSale = course.months.filter((month) => month.isOpen).map((month) => month.id);
    return slice.everything ? onSale : onSale.filter((id) => slice.monthIds.has(id));
  }

  async adminList(query: AdminPaymentQuery): Promise<{ rows: AdminPaymentRow[]; rowCount: number }> {
    const where = query.status ? { status: query.status } : {};


    const [rowCount, rows] = await this.prisma.$transaction([
      this.prisma.paymentSubmission.count({ where }),
      this.prisma.paymentSubmission.findMany({
        where,
        // Oldest pending first — a review queue is a support ticket queue.
        // Oldest first stays the default — a review queue is answered in the
        // order people joined it — but it is a CHOICE now. See
        // `AdminPaymentSortSchema`. The `id` tiebreak is not decoration:
        // Postgres does not order ties stably, and an unstable order under
        // pagination duplicates some claims onto page two while dropping
        // others, on a screen where every claim must be decided exactly once.
        orderBy: orderByForPayments(query.sort),
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
      /** `null` for a grant nobody issued by hand — see
       *  `grantFromMatchedTransfer`. `AccessGrant.grantedByUserId` is
       *  nullable for exactly this, and the `note` says what did it. */
      adminId: string | null;
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
      /** `null` for a grant nobody issued by hand — see `writePurchaseGrant`. */
      adminId: string | null;
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
   * The month-scoped counterpart of `writePurchaseGrant`. A third one of these
   * and not a fourth branch inside the first, because a `scope: course_month`
   * grant behaves like neither of its siblings.
   *
   * It is NEVER date-extended. `access_grants_month_open_ended` is a CHECK, so
   * writing a `validUntil` here does not produce a wrong date — it 23514s the
   * whole transaction and 500s the approval. That is the feature and not an
   * obstacle: «شهر ٢» is content the student bought, not thirty days they
   * rented, and its only cutoff is `revokedAt`. Nothing in this method may
   * reach `computeApprovalValidUntil`.
   *
   * And unlike a course grant there are legitimately MANY live ones at once,
   * one per month — so this creates several in one call, where
   * `writePurchaseGrant` extends exactly one.
   *
   * A month the student already holds LIVE is reused rather than re-created:
   * a re-approval, or an admin approving a claim for a month an InstaPay
   * transfer already paid for, must not leave two live grants that both have
   * to be revoked before the door actually closes. A REVOKED one is left
   * alone and a fresh row created beside it — `revokedAt` is permanent
   * everywhere else in this schema, and `writeTermGrant` already made that
   * call for the same reason.
   *
   * Returns the grant for the FIRST month in `monthIds`, which is what
   * `PaymentSubmission.grantId` is stamped with. That column is a single FK
   * and this operation just created up to twelve grants, so it names one
   * deterministically (the caller orders by `monthIndex`) and
   * `payment_submission_months` stays the real record of what the money
   * bought. `FinanceService.editAmount` consequently only finds the payment
   * behind that one grant — correct, since there was only ever one payment.
   */
  private async writeMonthGrants(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      courseId: string;
      /** Non-empty, and ordered by `monthIndex` so the returned id is stable. */
      monthIds: readonly string[];
      /** `null` for a grant nobody issued by hand — see `writePurchaseGrant`. */
      adminId: string | null;
      now: Date;
      note: string;
    },
  ): Promise<string> {
    const live = await tx.accessGrant.findMany({
      where: {
        userId: params.userId,
        courseId: params.courseId,
        scope: 'course_month',
        monthId: { in: [...params.monthIds] },
        revokedAt: null,
      },
      select: { id: true, monthId: true },
    });
    // `monthId` is non-null on every row this WHERE can return —
    // `access_grants_scope_target` makes that a database rule for
    // `course_month` — but the column is nullable in general and the type
    // system cannot see the guarantee, so the nulls are dropped rather than
    // asserted away.
    const held = new Map(
      live.flatMap((grant) => (grant.monthId === null ? [] : [[grant.monthId, grant.id] as const])),
    );

    let firstGrantId: string | null = null;
    for (const monthId of params.monthIds) {
      const existing = held.get(monthId);
      if (existing !== undefined) {
        firstGrantId ??= existing;
        continue;
      }
      // A loop of `create`s and not one `createMany`: the ids are the point —
      // one of them is stamped on the submission — and twelve is the hard
      // ceiling `month_index`'s own CHECK puts on this list.
      const created = await tx.accessGrant.create({
        data: {
          userId: params.userId,
          courseId: params.courseId,
          monthId,
          scope: 'course_month',
          source: 'purchase',
          grantedByUserId: params.adminId,
          validFrom: params.now,
          // NEVER a date — see this method's own note, and the CHECK.
          validUntil: null,
          note: params.note,
        },
        select: { id: true },
      });
      firstGrantId ??= created.id;
    }

    await tx.enrollment.upsert({
      where: { userId_courseId: { userId: params.userId, courseId: params.courseId } },
      create: { userId: params.userId, courseId: params.courseId, source: 'purchase' },
      update: { status: 'active', source: 'purchase' },
    });

    if (firstGrantId === null) {
      // Unreachable through `submit()`, which refuses an empty selection with
      // a sentence long before this. Thrown rather than returned as `''` so a
      // future caller that skips that check fails loudly instead of stamping
      // a submission with a grant id that names nothing.
      throw new BadRequestException('a month purchase must name at least one month');
    }
    return firstGrantId;
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
      select: {
        id: true,
        userId: true,
        courseId: true,
        plan: true,
        termId: true,
        status: true,
        // What the student actually CHOSE when they filed the claim, ordered
        // so the grant stamped on the submission is deterministic. Read off
        // these rows and never off the course: a month opened, closed or added
        // between the transfer and the review must not change what this
        // approval hands over — the money was for what was picked.
        months: { orderBy: { month: { monthIndex: 'asc' } }, select: { monthId: true } },
      },
    });
    if (!submission) throw new NotFoundException();
    if (submission.status !== 'pending') {
      throw new ConflictException('this submission was already reviewed');
    }

    /*
      The discriminator for the rest of this method, and it is the SUBMISSION's
      own rows rather than the course's configuration.

      Rows in `payment_submission_months` mean this claim bought specific
      curriculum months. Their absence on a `monthly` claim is the original
      rolling thirty-day plan, which is still what every course the instructor
      has not configured months for sells — and still what this claim bought,
      even if months were added to that course while it sat in the queue.
    */
    const monthIds = submission.months.map((row) => row.monthId);
    const isMonthPurchase = monthIds.length > 0;

    const now = new Date();
    /*
      `term` is not date-extended at all (see `writeTermGrant`'s own note), so
      it skips `resolvePurchaseExpiry` rather than computing an expiry nothing
      will read. A month purchase skips it for a harder reason: this is the
      single most likely way this feature 500s a real approval.

      `resolvePurchaseExpiry` is already `scope: 'course'`-only, so it cannot
      pick a month grant up by accident and try to UPDATE a date onto it — but
      the date it computes would be written by `writePurchaseGrant` as a fresh
      COURSE-wide grant, handing over the entire course for a month someone
      paid one month's price for. And a `validUntil` on the month grant itself
      is not a wrong date but a 23514 from
      `access_grants_month_open_ended` that rolls the whole approval back.
      Neither scope is date-based; neither may reach that function.
    */
    const { existingGrant, validUntil } =
      submission.plan === 'term' || isMonthPurchase
        ? { existingGrant: null, validUntil: null }
        : await this.resolvePurchaseExpiry(submission.userId, submission.courseId, submission.plan, now);

    const grantId = await this.prisma.$transaction(async (tx) => {
      const grantId = isMonthPurchase
        ? await this.writeMonthGrants(tx, {
            userId: submission.userId,
            courseId: submission.courseId,
            monthIds,
            adminId,
            now,
            note: `purchase: submission ${submission.id}`,
          })
        : submission.plan === 'term'
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
              // Non-null in this branch — only `term` and a month purchase
              // ever leave it null, and both are handled above.
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

      /*
        ONE notification, whether this bought one month or five.

        «الاشتراك اتقبل» is one event to the student — one transfer, one
        screenshot, one review — and five identical «اشتراكك في الكورس اتفعّل»
        rows in the bell would read as a bug. The existing payload already
        carries everything true about the month case: the course that opened,
        and `validUntil: null`, which for a month grant is not "we don't know"
        but the permanent shape of the thing. Naming the months would need a
        field `PaymentApprovedNotificationSchema` does not have.
      */
      await this.notifications.emit(tx, {
        userId: submission.userId,
        kind: 'payment_approved',
        courseId: submission.courseId,
        validUntil: validUntil ? validUntil.toISOString() : null,
      });

      return grantId;
    });

    /*
      The live half of «لما أقبل الاشتراك يتبعتله على طول».

      Outside the transaction on purpose: the row is what matters and it is
      already durable, and announcing from inside would push an event for a
      decision that could still roll back. A failed announcement costs the
      student nothing but the wait until their next poll — `announce` never
      throws.
    */
    await this.notifications.announce(submission.userId);

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
        // Empty on every plan but a month purchase. `grantId` names only the
        // FIRST of the grants this wrote (see `writeMonthGrants`), so without
        // these ids the audit row would understate what the approval opened.
        monthIds,
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
   *
   * ## Two things this door deliberately does NOT do that `submit()` does
   *
   * It still accepts `plan: 'quarterly'`. «٣ شهور» is off the shelf, not out
   * of the ledger — an admin recording a quarterly transfer that really
   * happened, or fixing a row he typed wrong, is that history rule working.
   * `submit()` is the sale path and is the one that refuses.
   *
   * It does not sell by MONTH, and on a course that does it still writes the
   * old course-wide dated grant. `AdminManualSubscribeSchema` has no field to
   * carry «شهر ٢ و٣», so there is nothing for this method to read — and
   * refusing instead would take away the admin's only way to record a
   * transfer that arrived over WhatsApp. It is the deliberate override, same
   * precedent as the `term.isOpen` note below, and it does mean «شهري» here
   * opens more than «شهري» in checkout does on such a course. Closing that
   * gap needs a month picker on the admin subscribe form and a contract
   * change to carry what it picks.
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
          // The rest of what `courseAccessScopes` needs, for the owned-months
          // read below.
          subjectId: true,
          requiresGrant: true,
          monthlyPriceCents: true,
          quarterlyPriceCents: true,
          yearlyPriceCents: true,
          terms: { select: { id: true, title: true, priceCents: true } },
          // EVERY month, open or not — `isOpen` is deliberately not a gate on
          // this route. See `AdminManualSubscribeSchema.monthIds`. Selected
          // anyway because `MonthOfferingCourse` carries it.
          months: { select: { id: true, isOpen: true } },
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

    const planPriceCents = resolvePlanPriceCents(course, input.plan, term?.priceCents ?? null);
    if (planPriceCents === null) {
      throw new BadRequestException('this course does not sell that plan');
    }

    /*
      «شهري» here has to mean what «شهري» means in checkout, and until this
      branch existed it did not.
 
      `submit()` already keys the two monthly products on the course having ANY
      `CourseMonth` row — the same fact `LessonAccessService.require` gates on.
      This route did not, so recording a WhatsApp transfer as «شهري» on a
      month-selling course wrote the old course-wide dated grant: it opens
      EVERY lecture, `/admin/finance` calls it a monthly subscription, and the
      student got more than anybody sold them with no screen saying so.
 
      Unlike `submit()`, the chosen months are not required to be OPEN — this
      is the admin override, the same precedent `term` above already sets by
      not checking `isOpen` either.
    */
    const courseSellsByMonth = course.months.length > 0;
    const buysMonths = input.plan === 'monthly' && courseSellsByMonth;

    if (input.plan === 'monthly' && !courseSellsByMonth && input.monthIds.length > 0) {
      throw new BadRequestException('this course does not sell by curriculum month');
    }

    let monthIds: string[] = [];
    if (buysMonths) {
      const refusal = checkMonthSelection({
        requested: input.monthIds,
        onSale: new Set(course.months.map((month) => month.id)),
        // Months this student already holds — the one failure here that costs
        // somebody real money and is otherwise invisible, because the grant
        // write is idempotent and nothing downstream would complain.
        owned: new Set(await this.ownedMonthIds(userId, course)),
      });
      if (refusal) throw new BadRequestException(monthSelectionMessage(refusal));
      monthIds = [...input.monthIds];
    }

    const now = new Date();
    const { existingGrant, validUntil } =
      input.plan === 'term' || buysMonths
        ? { existingGrant: null, validUntil: null }
        : await this.resolvePurchaseExpiry(userId, input.courseId, input.plan, now);
    const amountCents = amountCollectedCents(
      buysMonths ? monthPurchaseAmountCents(planPriceCents, monthIds.length) : planPriceCents,
      input.isFree,
    );

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
          : buysMonths
          ? await this.writeMonthGrants(tx, {
              userId,
              courseId: input.courseId,
              monthIds,
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
          // The months this one payment bought — the same join the student
          // flow writes, so `/admin/finance` and the student's own card read
          // one shape.
          months: buysMonths
            ? { createMany: { data: monthIds.map((monthId) => ({ monthId, courseId: input.courseId })) } }
            : undefined,
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

    // The admin subscribed them by hand; the student still gets told, live,
    // exactly as they would from a reviewed claim.
    await this.notifications.announce(userId);

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
        monthIds,
        isFree: input.isFree,
        amountCents,
        validUntil: validUntil ? validUntil.toISOString() : null,
      },
    });

    return this.adminListSubscriptions(userId);
  }

  /**
   * Approves a pending claim because the money for it actually arrived.
   *
   * `TransfersService` has matched an incoming transfer to this submission —
   * the sender's InstaPay address belongs to this student and the amount is
   * the amount claimed. That is the whole proof, and it is a stronger one than
   * the screenshot an admin would otherwise be squinting at: the screenshot
   * comes from the student, this comes from the account that received the
   * money.
   *
   * Approves an EXISTING claim and never creates one. The student still files
   * a claim exactly as before — nothing about their side of this changed —
   * and a transfer with no claim behind it says who paid but not what for, so
   * it waits in the ledger instead.
   *
   * Reuses `resolvePurchaseExpiry`/`writePurchaseGrant`/`writeTermGrant`
   * rather than computing its own dates, for the same reason
   * `adminManualSubscribe` does: three ways to start a subscription must not
   * become three opinions about when it ends.
   *
   * ## Why this can be trusted to run unattended
   *
   * Two `updateMany` guards, each conditional on the state that must still
   * hold: the transfer is claimed only `WHERE matched_submission_id IS NULL`,
   * and the submission approved only `WHERE status = 'pending'`. Either
   * returning zero rows means something got there first — a retried webhook,
   * an admin clicking approve at the same moment — and the transaction is
   * abandoned. Behind them sits the UNIQUE index on
   * `incoming_transfers.matched_submission_id`, which is the guarantee the
   * database itself makes that one claim cannot be paid twice.
   *
   * Returns `null` when it lost that race, having changed nothing.
   */
  async approveFromTransfer(
    submissionId: string,
    transferId: string,
  ): Promise<{ validUntil: Date | null } | null> {
    const submission = await this.prisma.paymentSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        userId: true,
        courseId: true,
        plan: true,
        termId: true,
        status: true,
        // What the student actually CHOSE when they filed the claim, ordered
        // so the grant stamped on the submission is deterministic. Read off
        // these rows and never off the course: a month opened, closed or added
        // between the transfer and the review must not change what this
        // approval hands over — the money was for what was picked.
        months: { orderBy: { month: { monthIndex: 'asc' } }, select: { monthId: true } },
      },
    });
    if (!submission || submission.status !== 'pending') return null;

    // Same discriminator, same reason, as `approve()` — and it matters more
    // here, because nobody is watching. Without this branch an InstaPay
    // transfer matched against a month purchase would quietly write a dated,
    // course-wide grant and hand over every lecture on the course for the
    // price of one month.
    const monthIds = submission.months.map((row) => row.monthId);
    const isMonthPurchase = monthIds.length > 0;

    const now = new Date();
    const { existingGrant, validUntil } =
      submission.plan === 'term' || isMonthPurchase
        ? { existingGrant: null, validUntil: null }
        : await this.resolvePurchaseExpiry(submission.userId, submission.courseId, submission.plan, now);

    const note = `instapay: matched transfer ${transferId}`;

    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.incomingTransfer.updateMany({
          where: { id: transferId, matchedSubmissionId: null },
          data: { matchedSubmissionId: submissionId },
        });
        if (claimed.count === 0) throw new AlreadySettled();

        const approved = await tx.paymentSubmission.updateMany({
          where: { id: submissionId, status: 'pending' },
          // `reviewedByUserId` stays null on purpose: no admin reviewed this.
          // The audit row and the grant note say what did.
          data: { status: 'approved', reviewedAt: now },
        });
        if (approved.count === 0) throw new AlreadySettled();

        const grantId = isMonthPurchase
          ? await this.writeMonthGrants(tx, {
              userId: submission.userId,
              courseId: submission.courseId,
              monthIds,
              adminId: null,
              now,
              note,
            })
          : submission.plan === 'term'
            ? await this.writeTermGrant(tx, {
                userId: submission.userId,
                courseId: submission.courseId,
                // Non-null for `plan: 'term'` — `submit()` never writes one
                // without it.
                termId: submission.termId as string,
                adminId: null,
                now,
                note,
              })
            : await this.writePurchaseGrant(tx, {
                userId: submission.userId,
                courseId: submission.courseId,
                adminId: null,
                now,
                validUntil: validUntil as Date,
                existingGrant,
                note,
              });

        await tx.paymentSubmission.update({ where: { id: submissionId }, data: { grantId } });

        await this.notifications.emit(tx, {
          userId: submission.userId,
          kind: 'payment_approved',
          courseId: submission.courseId,
          validUntil: validUntil ? validUntil.toISOString() : null,
        });
      });
    } catch (error) {
      if (error instanceof AlreadySettled) return null;
      throw error;
    }

    // AFTER the commit, never inside it — see `NotificationsService.announce`.
    await this.notifications.announce(submission.userId);

    await this.audit.record({
      action: 'payment:auto-approve',
      resourceType: AUDIT_RESOURCES.paymentSubmission,
      resourceId: submissionId,
      // No actor: nobody clicked anything. `transferId` is how this decision
      // is traced back to the line of text it came from.
      actorUserId: null,
      outcome: 'success',
      metadata: {
        userId: submission.userId,
        courseId: submission.courseId,
        plan: submission.plan,
        termId: submission.termId,
        // See `approve()`'s own note — `grantId` is not on this row at all, so
        // the months are the only record of what an unattended approval opened.
        monthIds,
        transferId,
        validUntil: validUntil ? validUntil.toISOString() : null,
      },
    });

    return { validUntil };
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
      // cannot be cancelled through this student's URL. `term` and
      // `course_month` alongside `course` — this is the same manual-subscribe
      // section's own cancel button, for every kind of grant it can create.
      //
      // ⚠️ `course_month` was missing, and that route 404'd on the commonest
      // grant on the platform the day four courses moved to months. The web
      // UI now cancels through `FinanceService` instead (it asks about the
      // refund too), so nothing calls this any more — but the endpoint is
      // still exposed, and an endpoint that refuses the ordinary case is a
      // trap for whoever finds it next.
      where: {
        id: grantId,
        userId,
        scope: { in: ['course', 'term', 'course_month'] },
        source: 'purchase',
      },
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
  /*
   * ⚠️ `scope: { in: ['course', 'term'] }` below, and in
   * `adminCancelSubscription` above: a `course_month` grant deliberately does
   * NOT appear in this section. `AdminSubscriptionRow` carries a `termId`/
   * `termTitle` pair and no month equivalent, so a month grant would render
   * here as an unnamed course row with a null expiry — five of them for one
   * payment. `/admin/finance` already lists and cancels month grants with a
   * shape that can name them (see `FinanceService.list`'s own scope note),
   * which is why this was left narrow rather than made half-right.
   */
  async adminListSubscriptions(userId: string): Promise<AdminSubscriptionRow[]> {
    const grants = await this.prisma.accessGrant.findMany({
      // `course_month` alongside the other two: a hand-recorded month payment
      // is exactly as real a subscription, and leaving it out meant the admin
      // pressed «اشترك» and the panel below showed nothing at all.
      where: { userId, scope: { in: ['course', 'term', 'course_month'] }, source: 'purchase' },
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
        monthId: true,
        course: { select: { title: true } },
        term: { select: { title: true } },
        month: { select: { title: true } },
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
      // Every scope in the filter guarantees `courseId`/`course`,
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
          monthId: grant.monthId,
          monthTitle: grant.month?.title ?? null,
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

    // Same as the approval above: the student learns instantly, on whatever
    // page they happen to be sitting on.
    await this.notifications.announce(submission.userId);

    await this.audit.record({
      action: 'payment:reject',
      resourceType: AUDIT_RESOURCES.paymentSubmission,
      resourceId: submission.id,
      outcome: 'success',
      metadata: { userId: submission.userId, courseId: submission.courseId, reason: input.reason },
    });
  }
}

/**
 * `sort` → a real `ORDER BY` for the review queue.
 *
 * Every branch ends on `id` (uuid(7), so also chronological). Ties are common
 * here — several claims submitted in the same second during a launch, or two
 * claims for the same plan price — and an unstable order under pagination
 * shows some twice and hides others, on a queue where each claim must be
 * decided exactly once.
 */
function orderByForPayments(
  sort: AdminPaymentSort,
): Prisma.PaymentSubmissionOrderByWithRelationInput[] {
  switch (sort) {
    case 'newest':
      return [{ createdAt: 'desc' }, { id: 'desc' }];
    case 'amount_desc':
      return [{ amountCents: 'desc' }, { id: 'desc' }];
    case 'amount_asc':
      return [{ amountCents: 'asc' }, { id: 'asc' }];
    case 'oldest':
    default:
      return [{ createdAt: 'asc' }, { id: 'asc' }];
  }
}
