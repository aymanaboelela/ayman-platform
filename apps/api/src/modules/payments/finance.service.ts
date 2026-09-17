import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminFinanceCancelInput,
  AdminFinanceEditAmountInput,
  AdminFinanceEditDatesInput,
  AdminFinanceFilterCounts,
  AdminFinanceQuery,
  AdminFinanceRow,
  AdminFinanceSelection,
  AdminFinanceSummary,
  FinancePlanFilter,
  FinanceSort,
  FinanceStreamFilter,
} from '@ayman/contracts/admin/finance';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { EXPIRING_SOON_WINDOW_MS, financeStatusFor } from './finance-status';
import type { Prisma } from '../../generated/prisma/client';

/**
 * «الاشتراكات والإيرادات» — who has paid, how much, and when it runs out.
 *
 * `AccessGrant` is the source of truth, not `PaymentSubmission`: a grant is
 * the live-or-lapsed SUBSCRIPTION, and a student who renewed twice has one of
 * those behind two payment rows (see the model note on why approval extends
 * one grant rather than stacking many). `/admin/payments` is already the
 * append-only history of individual payments; this screen reports the
 * subscriptions they produced.
 *
 * ## Filter/sort/facet counts are computed in application code
 *
 * `plan`, `year` and `stream` all depend on either the grant's LATEST
 * approved submission (not a plain column Postgres can filter on directly —
 * a renewal can change plan between payments) or a joined `Course` column.
 * Rather than reach for raw SQL, `list()` fetches every grant matching the
 * `status` filter UNPAGINATED (bounded by nothing beyond the real dataset —
 * a few dozen live subscribers today, see the PR description for the actual
 * count checked before choosing this), then filters, sorts and paginates in
 * memory. This is the same reason `sort` needs application code too: `paidAt`
 * is `paymentSubmissions[0].reviewedAt`, not a grant column either.
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(
    query: AdminFinanceQuery,
  ): Promise<{ rows: AdminFinanceRow[]; rowCount: number; summary: AdminFinanceSummary }> {
    const now = new Date();
    const soon = new Date(now.getTime() + EXPIRING_SOON_WINDOW_MS);

    const base: Prisma.AccessGrantWhereInput = {
      source: 'purchase',
      // `term` alongside `course`: a term-scoped subscription is exactly as
      // real a live subscription as a course-wide one, and belongs on this
      // screen — see `statusForGrant`'s own note on how it never lapses by
      // date the way a course-wide one does.
      scope: { in: ['course', 'term'] },
      // A manually revoked grant is no longer a subscription anybody is
      // paying for — the same reason `PaymentsService.approve` only ever
      // looks at `revokedAt: null` when deciding whether to extend one. For
      // a `term` grant this is ALSO how a closed term disappears from this
      // screen: `TermService.setOpen` stamps this on every live one.
      revokedAt: null,
    };

    const where: Prisma.AccessGrantWhereInput = {
      ...base,
      ...statusWhere(query.status, now, soon),
    };

    const [grants, activeCount, expiringSoonCount, revenue, refunds] =
      await this.prisma.$transaction([
      this.prisma.accessGrant.findMany({
        where,
        // Not the final order — `sortByPaidAt` re-sorts in memory below.
        // Kept only for a stable, deterministic starting order.
        orderBy: [{ id: 'desc' }],
        select: GRANT_SELECT,
      }),
      // Every LIVE term grant counts as "active" unconditionally — see
      // `statusForGrant`. Deliberately unaffected by `query.status`/`plan`/
      // `year`/`stream` — same as before this feature, these three tiles
      // are the GLOBAL numbers, not "how many match the current filter".
      this.prisma.accessGrant.count({
        where: { ...base, OR: [{ scope: 'course', validUntil: { gt: now } }, { scope: 'term' }] },
      }),
      // Term grants never sit in the "expiring soon" window — nothing here
      // reads `CourseTerm.isOpen` as a countdown, so this stays `scope:
      // 'course'`-only exactly as before.
      this.prisma.accessGrant.count({
        where: { ...base, scope: 'course', validUntil: { gte: now, lte: soon } },
      }),
      this.prisma.paymentSubmission.aggregate({
        where: {
          status: 'approved',
          // Never counts an admin-comped term — `countsAsRevenue`'s own note
          // is why this is a direct `isFree: false` filter rather than
          // trusting `amountCents = 0` alone.
          //
          // No `reviewedAt` date bound — this used to be scoped to the
          // current calendar month and reset to zero on the 1st, which read
          // as money vanishing rather than as a monthly figure starting
          // over. Ayman's own correction: the tile is a running total, not
          // a month-to-date one.
          isFree: false,
        },
        _sum: { amountCents: true },
      }),
      // Money given back against subscriptions, all time — the same grain as
      // the revenue aggregate above, and subtracted from it below.
      //
      // ⚠️ `submissionId: { not: null }` is what makes this the SUBSCRIPTION
      // half: `refunds_one_target` guarantees a row names exactly one side, so
      // this partitions the table against the book half with no overlap.
      this.prisma.refund.aggregate({
        where: { submissionId: { not: null } },
        _sum: { amountCents: true },
      }),
    ]);

    // `courseId`/`course` are nullable on `AccessGrant` in general (a
    // `subject_teacher` grant has no single course) but never for a row
    // THIS where clause can return — `scope: { in: ['course', 'term'] }`
    // guarantees the course either way. A row missing course info is
    // dropped rather than rendered with a blank cell — the type system
    // cannot see the guarantee the query makes, but nothing here should
    // trust it blindly.
    const valid = grants.filter(hasCourse);

    const filterCounts = computeFilterCounts(valid);

    const filtered = valid.filter(
      (grant) =>
        matchesPlan(grant, query.plan) &&
        matchesYear(grant, query.year) &&
        matchesStream(grant, query.stream),
    );

    sortByPaidAt(filtered, query.sort);

    // Everything about the rows the reader is actually looking at. Computed
    // from `filtered` — the identical array the table is paginated out of — so
    // the strip above the table and the rows below it can never disagree.
    const selection = computeSelection(filtered, now);

    const rowCount = filtered.length;
    const start = (query.page - 1) * query.perPage;
    const page = filtered.slice(start, start + query.perPage);

    const revenueTotalCents = revenue._sum.amountCents ?? 0;
    const refundsTotalCents = refunds._sum.amountCents ?? 0;

    // Per-row refund totals, for the PAGE only — at most `perPage` grants, not
    // the whole filtered set. One query with an `in`, never one per row: the
    // rest of this method is already careful about that (see `_count` on
    // `GRANT_SELECT`), and a per-row read here would undo it.
    const refundByGrant = await this.refundsByGrant(page.map((grant) => grant.id));

    return {
      rowCount,
      rows: page.map((grant) => toRow(grant, now, refundByGrant.get(grant.id) ?? 0)),
      summary: {
        revenueTotalCents,
        refundsTotalCents,
        netRevenueTotalCents: revenueTotalCents - refundsTotalCents,
        activeCount,
        expiringSoonCount,
        filterCounts,
        selection,
      },
    };
  }

  /**
   * «القيمة اللي اتسجلت غلط» — corrects what the LATEST approved submission
   * behind this grant actually collected. Edits `PaymentSubmission
   * .amountCents`/`.isFree` directly — the exact columns `AdminFinanceRow
   * .amountCents`/`.isFree` are read from, so the fix is immediately visible
   * on this same screen and in `summary.revenueTotalCents` (which reads
   * `isFree` too) the moment it is saved — the total is not scoped to a
   * calendar month, so there is no "wrong month" for a correction to miss.
   */
  async editAmount(
    adminId: string,
    grantId: string,
    input: AdminFinanceEditAmountInput,
  ): Promise<AdminFinanceRow> {
    const grant = await this.findMutableGrant(grantId);

    const latest = await this.prisma.paymentSubmission.findFirst({
      where: { grantId: grant.id, status: 'approved' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, amountCents: true, isFree: true },
    });
    if (!latest) throw new NotFoundException('no approved payment behind this grant');

    await this.prisma.paymentSubmission.update({
      where: { id: latest.id },
      data: { amountCents: input.amountCents, isFree: input.isFree },
    });

    await this.audit.record({
      action: 'payment:finance-edit-amount',
      resourceType: AUDIT_RESOURCES.paymentSubmission,
      resourceId: latest.id,
      outcome: 'success',
      metadata: {
        adminId,
        userId: grant.userId,
        courseId: grant.courseId,
        grantId: grant.id,
        before: { amountCents: latest.amountCents, isFree: latest.isFree },
        after: { amountCents: input.amountCents, isFree: input.isFree },
      },
    });

    return this.getRow(grant.id);
  }

  /**
   * «أنا سوبر أدمن، أعمل اللي أنا عايزه» — direct override of a `scope:
   * 'course'` grant's window. Writes `AccessGrant.validFrom`/`.validUntil`
   * straight through, with no bounds-checking beyond the one real
   * constraint: a `scope: 'term'` grant has no calendar `validUntil` to
   * override in the first place (see the contract's own note), so setting
   * one is rejected rather than silently accepted and ignored.
   *
   * A past `validUntil` takes effect on the very next lesson open —
   * `LessonAccessService.require`'s live re-check reads this same column
   * through `EntitlementService.resolveCourseAccess`, not a cached or
   * derived value.
   */
  async editDates(
    adminId: string,
    grantId: string,
    input: AdminFinanceEditDatesInput,
  ): Promise<AdminFinanceRow> {
    const grant = await this.findMutableGrant(grantId);

    if (grant.scope === 'term' && input.validUntil !== null) {
      throw new BadRequestException(
        'a term grant has no calendar expiry — its cutoff is revokedAt, stamped when the term closes',
      );
    }

    const validFrom = new Date(input.validFrom);
    const validUntil = input.validUntil ? new Date(input.validUntil) : null;

    await this.prisma.accessGrant.update({
      where: { id: grant.id },
      data: { validFrom, validUntil },
    });

    await this.audit.record({
      action: 'payment:finance-edit-dates',
      resourceType: 'access_grant',
      resourceId: grant.id,
      outcome: 'success',
      metadata: {
        adminId,
        userId: grant.userId,
        courseId: grant.courseId,
        before: {
          validFrom: grant.validFrom.toISOString(),
          validUntil: grant.validUntil?.toISOString() ?? null,
        },
        after: {
          validFrom: validFrom.toISOString(),
          validUntil: validUntil?.toISOString() ?? null,
        },
      },
    });

    return this.getRow(grant.id);
  }

  /**
   * Ends a subscription BEFORE its natural expiry, with a reason — the same
   * stamp-`revokedAt` mechanism `PaymentsService.adminCancelSubscription`
   * already uses (so the same `resolveCourseAccess`/`LessonAccessService`
   * enforcement picks it up immediately), plus the reason itself and whether
   * it should ever reach the student.
   *
   * `showToStudent: true` is the ONLY path that writes a
   * `subscription_cancelled` notification — left off (the default), the
   * reason is admin-eyes-only, same as every cancellation before this
   * feature. Re-cancelling an already-revoked grant does not move
   * `revokedAt` again (idempotent, same as the older method), but DOES let
   * the admin attach or correct a reason after the fact.
   *
   * ## `refundCents` — and why cancelling alone never moves the money
   *
   * This method used to be purely an ACCESS operation: it stamped three
   * columns on the grant and nothing else, while every revenue figure
   * aggregates `PaymentSubmission` with no join back to it. So a refunded
   * subscription kept 100% of its money in «إجمالي الإيرادات» and «صافي
   * الربح» permanently — and since `list()` filters `revokedAt: null`, the
   * cancelled row left the only screen that could edit its amount. The money
   * became unreachable through any UI.
   *
   * The fix is NOT "cancelling subtracts the amount". Two different things
   * were being conflated:
   *
   *   * «قطعته لأنه بيغش» — access ends, the money stays. Nothing is refunded
   *     and revenue is correct as it stands.
   *   * «رجعتله فلوسه» — money genuinely left. That, and only that, reduces
   *     revenue.
   *
   * Making the deduction automatic would restate revenue downwards on every
   * disciplinary cancellation. So `refundCents` is an explicit, separate
   * field, and when it is set this writes a `Refund` row dated TODAY —
   * landing in the month the money actually went back, not the month of the
   * original sale. Re-cancelling with a refund a second time adds a SECOND
   * refund row: partial refunds are real, and the ledger is append-only for
   * the same reason a payment history is.
   */
  async cancel(
    adminId: string,
    grantId: string,
    input: AdminFinanceCancelInput,
  ): Promise<AdminFinanceRow> {
    const grant = await this.findMutableGrant(grantId);
    const alreadyRevoked = grant.revokedAt !== null;

    // Resolved BEFORE the transaction so a refund that cannot be attributed
    // fails the whole request rather than half-cancelling. `null` whenever no
    // refund was asked for.
    // `== null`, catching `undefined` as well as `null`: the contract's
    // `.default(null)` only fires for input that came through the schema, and
    // this service is also called directly (by its own spec, and by anything
    // internal that builds the input by hand). Treating a missing field as
    // "refund of undefined" is how a cancel 500s instead of just cancelling.
    const refund = input.refundCents == null ? null : await this.resolveRefund(grant.id, input);

    await this.prisma.$transaction(async (tx) => {
      await tx.accessGrant.update({
        where: { id: grant.id },
        data: {
          ...(alreadyRevoked ? {} : { revokedAt: new Date() }),
          cancelReason: input.reason,
          cancelReasonVisibleToStudent: input.showToStudent,
        },
      });

      if (refund !== null) {
        await tx.refund.create({
          data: {
            submissionId: refund.submissionId,
            amountCents: refund.amountCents,
            // The cancellation reason IS the refund reason — he is already
            // saying why, and a second required field is how one of the two
            // ends up blank or duplicated.
            reasonAr: input.reason,
            // `occurredOn` is a DATE column; the driver takes the timestamp
            // and Postgres keeps the day. Today, not the sale's date — see
            // the method doc and `Refund`'s own note on months.
            occurredOn: new Date(),
            createdBy: adminId,
          },
        });
      }

      if (input.showToStudent) {
        await this.notifications.emit(tx, {
          userId: grant.userId,
          kind: 'subscription_cancelled',
          courseId: grant.courseId,
          reason: input.reason,
        });
      }
    });

    await this.audit.record({
      action: 'payment:finance-cancel',
      resourceType: 'access_grant',
      resourceId: grant.id,
      outcome: 'success',
      metadata: {
        adminId,
        userId: grant.userId,
        courseId: grant.courseId,
        alreadyRevoked,
        reason: input.reason,
        showToStudent: input.showToStudent,
        // The amount is in the audit row, not only on the refund itself: this
        // is the trail that answers «رجعتله كام وامتى» after the grant, the
        // submission, or the course they hang off has been deleted.
        refundCents: refund?.amountCents ?? null,
        refundSubmissionId: refund?.submissionId ?? null,
      },
    });

    return this.getRow(grant.id);
  }

  /**
   * Turns «رجعتله ٢٥٠» into the submission it comes off, or refuses it.
   *
   * ## Which submission it lands on
   *
   * The LATEST approved one — the same row `editAmount` corrects and the same
   * row the screen's «آخر دفعة» column shows. A refund has to name a specific
   * payment (`refunds_one_target`), and the last one is both what the admin is
   * looking at and, for a renewing subscription, the one whose money is
   * actually in dispute.
   *
   * ## Why it is bounded
   *
   * The cap is what the grant has COLLECTED and not yet given back — every
   * approved submission's `amountCents`, minus every refund already recorded.
   * Without it a slipped digit («٢٥٠٠» for «٢٥٠») reports negative revenue for
   * the whole subscriptions stream, and the tile that is supposed to be the
   * owner's ground truth becomes the one lying loudest.
   *
   * A comped submission (`isFree`) contributes nothing to the cap: it was
   * never counted as revenue (see `countsAsRevenue`), so refunding against it
   * would subtract money that was never added.
   */
  private async resolveRefund(
    grantId: string,
    input: AdminFinanceCancelInput,
  ): Promise<{ submissionId: string; amountCents: number }> {
    const amountCents = input.refundCents;
    if (amountCents == null) throw new BadRequestException('no refund amount');

    const submissions = await this.prisma.paymentSubmission.findMany({
      where: { grantId, status: 'approved' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, amountCents: true, isFree: true, refunds: { select: { amountCents: true } } },
    });

    const latest = submissions[0];
    if (!latest) {
      throw new BadRequestException('مفيش دفعة متسجلة على الاشتراك ده ترجّع منها');
    }

    const collected = submissions
      .filter((submission) => !submission.isFree)
      .reduce((sum, submission) => sum + submission.amountCents, 0);
    const alreadyRefunded = submissions.reduce(
      (sum, submission) =>
        sum + submission.refunds.reduce((inner, refund) => inner + refund.amountCents, 0),
      0,
    );
    const refundable = collected - alreadyRefunded;

    if (refundable <= 0) {
      throw new BadRequestException('الاشتراك ده مفيهوش فلوس تترجّع');
    }
    if (amountCents > refundable) {
      throw new BadRequestException(
        `أكبر مبلغ ممكن يترجّع هو ${Math.floor(refundable / 100)} جنيه`,
      );
    }

    return { submissionId: latest.id, amountCents };
  }

  /** Shared ownership/shape check for every mutation above — a grant id
   *  from outside this screen's own domain (wrong scope, wrong source, or
   *  the rare `courseId: null` row `hasCourse` already excludes from `list`)
   *  404s rather than being half-accepted. */
  private async findMutableGrant(grantId: string): Promise<{
    id: string;
    userId: string;
    courseId: string;
    scope: 'course' | 'term';
    validFrom: Date;
    validUntil: Date | null;
    revokedAt: Date | null;
  }> {
    const grant = await this.prisma.accessGrant.findFirst({
      where: { id: grantId, scope: { in: ['course', 'term'] }, source: 'purchase' },
      select: {
        id: true,
        userId: true,
        courseId: true,
        scope: true,
        validFrom: true,
        validUntil: true,
        revokedAt: true,
      },
    });
    if (!grant || grant.courseId === null) throw new NotFoundException();
    return { ...grant, courseId: grant.courseId, scope: grant.scope as 'course' | 'term' };
  }

  /**
   * «رجعله كام» per grant, for a batch of grant ids.
   *
   * Refunds hang off the SUBMISSION, not the grant — that is the row carrying
   * the amount being reversed — so this walks grant → approved submissions →
   * refunds. Every approved submission counts, not only the latest: a student
   * who renewed three times and was refunded for two of them has both
   * reversals against his one subscription.
   *
   * Returns a Map so the caller can render a `0` for a grant with no refunds
   * without distinguishing "none" from "not fetched".
   */
  private async refundsByGrant(grantIds: readonly string[]): Promise<Map<string, number>> {
    const byGrant = new Map<string, number>();
    if (grantIds.length === 0) return byGrant;

    const submissions = await this.prisma.paymentSubmission.findMany({
      where: { grantId: { in: [...grantIds] }, status: 'approved' },
      select: { grantId: true, refunds: { select: { amountCents: true } } },
    });

    for (const submission of submissions) {
      if (submission.grantId === null) continue;
      const total = submission.refunds.reduce((sum, refund) => sum + refund.amountCents, 0);
      if (total === 0) continue;
      byGrant.set(submission.grantId, (byGrant.get(submission.grantId) ?? 0) + total);
    }

    return byGrant;
  }

  private async getRow(grantId: string): Promise<AdminFinanceRow> {
    const grant = await this.prisma.accessGrant.findFirst({
      where: { id: grantId },
      select: GRANT_SELECT,
    });
    if (!grant || !hasCourse(grant)) throw new NotFoundException();
    const refunded = await this.refundsByGrant([grant.id]);
    return toRow(grant, new Date(), refunded.get(grant.id) ?? 0);
  }
}

const GRANT_SELECT = {
  id: true,
  userId: true,
  courseId: true,
  termId: true,
  scope: true,
  validFrom: true,
  validUntil: true,
  cancelReason: true,
  cancelReasonVisibleToStudent: true,
  user: { select: { name: true } },
  course: { select: { title: true, year: true, forGeneral: true, forLanguages: true } },
  term: { select: { title: true } },
  // The most recent APPROVED submission behind this grant — its plan,
  // amount and review date are what "paid X on Y" means here, and the row
  // `editAmount` corrects. `take: 1` keeps this one row per grant rather
  // than one per payment; a renewal's earlier submissions are
  // `/admin/payments`'s job to show.
  paymentSubmissions: {
    where: { status: 'approved' },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { plan: true, amountCents: true, reviewedAt: true, isFree: true },
  },
  // Every approved submission, counted — `renewalCount` below is this minus
  // one. A filtered relation `_count`, not a second query per grant.
  _count: { select: { paymentSubmissions: { where: { status: 'approved' } } } },
} satisfies Prisma.AccessGrantSelect;

type GrantRow = Prisma.AccessGrantGetPayload<{ select: typeof GRANT_SELECT }>;
type GrantRowWithCourse = GrantRow & { courseId: string; course: NonNullable<GrantRow['course']> };

function hasCourse(grant: GrantRow): grant is GrantRowWithCourse {
  return grant.courseId !== null && grant.course !== null;
}

function toRow(grant: GrantRowWithCourse, now: Date, refundedCents: number): AdminFinanceRow {
  const latest = grant.paymentSubmissions[0] ?? null;
  return {
    id: grant.id,
    userId: grant.userId,
    studentName: grant.user.name,
    courseId: grant.courseId,
    courseTitle: grant.course.title,
    plan: latest?.plan ?? null,
    termId: grant.termId,
    termTitle: grant.term?.title ?? null,
    amountCents: latest?.amountCents ?? null,
    paidAt: latest?.reviewedAt?.toISOString() ?? null,
    isFree: latest?.isFree ?? null,
    validUntil: grant.validUntil?.toISOString() ?? null,
    validFrom: grant.validFrom.toISOString(),
    // Guaranteed one of these two by the base query's `scope: { in: ['course',
    // 'term'] }` — see `FinanceService.list`'s own note on `hasCourse`.
    scope: grant.scope as 'course' | 'term',
    status: statusForGrant(grant, now),
    renewalCount: Math.max(0, grant._count.paymentSubmissions - 1),
    cancelReason: grant.cancelReason,
    cancelReasonVisibleToStudent: grant.cancelReasonVisibleToStudent,
    refundedCents,
  };
}

/**
 * «لما أحدد فلتر، عايز أعرف الأرقام».
 *
 * Pure, and over the SAME array the table paginates — not a second query with
 * a re-derived where clause, which is how a summary starts disagreeing with
 * the rows under it.
 *
 * Two judgement calls worth knowing about:
 *
 * · **`studentCount` is distinct users, not rows.** One person holding a term
 *   subscription and a monthly one is two subscriptions and one student, and
 *   «كام واحد مشترك» means the second.
 *
 * · **`revenueCents` sums the LATEST payment per grant**, matching the «آخر
 *   دفعة» column a reader would add up by hand — NOT every payment ever, which
 *   is what the global revenue tile sums. The two are different questions and
 *   the copy names this one «مجموع آخر دفعة».
 */
function computeSelection(
  grants: readonly GrantRowWithCourse[],
  now: Date,
): AdminFinanceSelection {
  const students = new Set<string>();
  const byCourse = new Map<
    string,
    { courseTitle: string; subscriptionCount: number; students: Set<string>; revenueCents: number; freeCount: number }
  >();
  const streamFlags = { general: 0, languages: 0, both: 0 };
  const byStatus = { active: 0, expiringSoon: 0, expired: 0 };

  let revenueCents = 0;
  let freeCount = 0;
  let paidCount = 0;

  for (const grant of grants) {
    students.add(grant.userId);

    const latest = grant.paymentSubmissions[0] ?? null;
    // A grant with no approved submission behind it is neither free nor paid —
    // see the schema note. It still counts as a subscription.
    if (latest !== null) {
      if (latest.isFree) freeCount += 1;
      else {
        paidCount += 1;
        revenueCents += latest.amountCents;
      }
    }

    if (grant.course.forGeneral) streamFlags.general += 1;
    if (grant.course.forLanguages) streamFlags.languages += 1;
    if (grant.course.forGeneral && grant.course.forLanguages) streamFlags.both += 1;

    const status = statusForGrant(grant, now);
    if (status === 'active') byStatus.active += 1;
    else if (status === 'expiring_soon') byStatus.expiringSoon += 1;
    else byStatus.expired += 1;

    const bucket = byCourse.get(grant.courseId) ?? {
      courseTitle: grant.course.title,
      subscriptionCount: 0,
      students: new Set<string>(),
      revenueCents: 0,
      freeCount: 0,
    };
    bucket.subscriptionCount += 1;
    bucket.students.add(grant.userId);
    if (latest !== null) {
      if (latest.isFree) bucket.freeCount += 1;
      else bucket.revenueCents += latest.amountCents;
    }
    byCourse.set(grant.courseId, bucket);
  }

  return {
    subscriptionCount: grants.length,
    studentCount: students.size,
    revenueCents,
    freeCount,
    paidCount,
    // Biggest first, then by title so the order is stable between two courses
    // with the same count — a list that reshuffles on every refresh is a list
    // nobody trusts.
    byCourse: [...byCourse.entries()]
      .map(([courseId, b]) => ({
        courseId,
        courseTitle: b.courseTitle,
        subscriptionCount: b.subscriptionCount,
        studentCount: b.students.size,
        revenueCents: b.revenueCents,
        freeCount: b.freeCount,
      }))
      .sort((a, b) =>
        b.subscriptionCount - a.subscriptionCount || a.courseTitle.localeCompare(b.courseTitle, 'ar'),
      ),
    streamFlags,
    byStatus,
  };
}

function matchesPlan(grant: GrantRowWithCourse, planFilter: FinancePlanFilter | undefined): boolean {
  if (!planFilter) return true;
  const latest = grant.paymentSubmissions[0] ?? null;
  // Orthogonal to the four plan values — see `FinancePlanFilterSchema`'s own
  // note on why a row can match both `free` and, say, `monthly`.
  if (planFilter === 'free') return latest?.isFree === true;
  return latest?.plan === planFilter;
}

function matchesYear(grant: GrantRowWithCourse, year: number | undefined): boolean {
  if (year === undefined) return true;
  return grant.course.year === year;
}

function matchesStream(grant: GrantRowWithCourse, stream: FinanceStreamFilter | undefined): boolean {
  if (!stream) return true;
  return stream === 'general' ? grant.course.forGeneral : grant.course.forLanguages;
}

/** In place, same convention as `Array.prototype.sort`. A `null` `paidAt`
 *  (no approved submission behind the grant) always sorts last, in either
 *  direction — see `FinanceSortSchema`'s own note. */
function sortByPaidAt(grants: GrantRowWithCourse[], sort: FinanceSort): void {
  grants.sort((a, b) => {
    const av = a.paymentSubmissions[0]?.reviewedAt?.getTime() ?? null;
    const bv = b.paymentSubmissions[0]?.reviewedAt?.getTime() ?? null;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return sort === 'paid_asc' ? av - bv : bv - av;
  });
}

/** Facet counts for the filter chips — see `AdminFinanceFilterCountsSchema`'s
 *  own note on why these are computed over the `status`-filtered set but
 *  independent of `plan`/`year`/`stream` themselves. */
function computeFilterCounts(grants: readonly GrantRowWithCourse[]): AdminFinanceFilterCounts {
  const plan = { monthly: 0, quarterly: 0, yearly: 0, term: 0, free: 0 };
  const year: Record<string, number> = {};
  const stream = { general: 0, languages: 0 };

  for (const grant of grants) {
    const latest = grant.paymentSubmissions[0] ?? null;
    switch (latest?.plan) {
      case 'monthly':
        plan.monthly++;
        break;
      case 'quarterly':
        plan.quarterly++;
        break;
      case 'yearly':
        plan.yearly++;
        break;
      case 'term':
        plan.term++;
        break;
      default:
        break;
    }
    if (latest?.isFree) plan.free++;

    const key = String(grant.course.year);
    year[key] = (year[key] ?? 0) + 1;

    if (grant.course.forGeneral) stream.general++;
    if (grant.course.forLanguages) stream.languages++;
  }

  return { plan, year, stream };
}

/**
 * A `term` grant is always `'active'` while it is on this screen at all —
 * the base query's `revokedAt: null` is the only gate it is ever subject to
 * (closing the term is what sets that), and it has no `validUntil` to
 * measure a countdown against. Only a `course` grant goes through the real
 * date math.
 *
 * A `course` grant's `validUntil` is `null` for the same reason a `term`
 * grant's always is: `editDates` deliberately allows `validUntil: null` on a
 * course-scope grant to "reopen it open-ended" (see
 * `AdminFinanceEditDatesSchema`'s own doc) — this screen has to read that
 * same state back without crashing, not just accept writing it. Treated as
 * `'active'`, the same as a term grant with no calendar expiry of its own.
 */
function statusForGrant(
  grant: { scope: 'course' | 'term' | 'platform' | 'subject_teacher' | 'unassigned'; validUntil: Date | null },
  now: Date,
): AdminFinanceRow['status'] {
  if (grant.scope === 'term' || grant.validUntil === null) return 'active';
  return financeStatusFor(grant.validUntil, now);
}

function statusWhere(
  status: AdminFinanceQuery['status'],
  now: Date,
  soon: Date,
): Prisma.AccessGrantWhereInput {
  switch (status) {
    case 'expired':
      // A term grant can never be expired — see `statusForGrant`.
      return { scope: 'course', validUntil: { lt: now } };
    case 'expiring_soon':
      return { scope: 'course', validUntil: { gte: now, lte: soon } };
    case 'active':
      return { OR: [{ scope: 'course', validUntil: { gt: soon } }, { scope: 'term' }] };
    default:
      return {};
  }
}
