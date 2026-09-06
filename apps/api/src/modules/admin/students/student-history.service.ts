import { Injectable } from '@nestjs/common';
import type { StudentHistoryEntry, StudentHistoryKind } from '@ayman/contracts/admin/students';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * «اتعمل إيه في الحساب ده، ومين عمله؟» — one chronological answer.
 *
 * ## Why this is not a column on an existing panel
 *
 * Two screens already show a student's money, and BOTH filter
 * `source: 'purchase'` — `PaymentsService.adminListSubscriptions` (the
 * profile's subscription panel) and `FinanceService.list` (`/admin/finance`).
 * A course an admin opened by hand is `source: 'admin'`, so it appears on
 * neither: the student holds a live, never-expiring grant to a paid course
 * and every screen that talks about paying for courses says nothing at all.
 * `CourseAccessSection` does list it, but as a state — it cannot say who
 * issued it, or when relative to anything else.
 *
 * That gap is not hypothetical. It is how a student who was hand-granted a
 * closed course on 26 August, and who ordered the book on 6 September, reads
 * as «اشترى الكتاب فاتفتح له الكورس» on every screen an operator has.
 *
 * ## Why the events are read from the domain tables, not `audit_log`
 *
 * The audit log is append-only, hash-chained and permission-gated behind
 * `audit:read`, and its rows carry the ACTOR well — but a row is written only
 * where somebody remembered to call `AuditService.record`, its metadata shape
 * differs per action, and it has no row for anything that predates the action
 * being added to `AUDIT_ACTIONS`. The grants, submissions and orders
 * themselves each carry their own timestamps and their own `*ByUserId`, so
 * they answer both halves of the question for every row that exists, with no
 * backfill. `audit_log` stays the tamper-evident record; this is the
 * operator's read.
 *
 * Ordering is newest-first and the list is flat, deliberately: the answer to
 * "did the book open the course" is the eleven days BETWEEN two entries, and
 * grouping by kind is precisely what hides it.
 */
@Injectable()
export class StudentHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<StudentHistoryEntry[]> {
    const [user, grants, submissions, orders] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          createdAt: true,
          bannedAt: true,
          bannedReason: true,
          bannedBy: { select: { name: true } },
        },
      }),
      this.prisma.accessGrant.findMany({
        // `platform` is included on purpose. It is the automatic
        // "v1 is free for every registered student" row, and its absence from
        // this list is what would make a free-course enrolment look like it
        // came from nowhere.
        where: { userId },
        select: {
          id: true,
          scope: true,
          source: true,
          courseId: true,
          validFrom: true,
          validUntil: true,
          revokedAt: true,
          cancelReason: true,
          note: true,
          course: { select: { title: true } },
          grantedBy: { select: { name: true } },
        },
      }),
      this.prisma.paymentSubmission.findMany({
        where: { userId },
        select: {
          id: true,
          plan: true,
          amountCents: true,
          isFree: true,
          status: true,
          rejectionReason: true,
          createdAt: true,
          reviewedAt: true,
          course: { select: { id: true, title: true } },
          reviewedBy: { select: { name: true } },
        },
      }),
      /*
       * ⚠️ Matched on `userId` ONLY, never on the phone number.
       *
       * `BookOrdersService.listMine` deliberately unions on the phone so a
       * guest order still reaches the student's own dashboard. Doing that
       * here would put a household's orders — a sibling's, a parent's — into
       * an operator's account history as things this account did, on the one
       * screen whose entire purpose is establishing who did what. A guest
       * order is genuinely not an event on this account; see `create`'s note
       * on why the row is never claimed.
       */
      this.prisma.bookOrder.findMany({
        where: { userId, deletedAt: null },
        select: {
          id: true,
          amountCents: true,
          status: true,
          createdAt: true,
          paidAt: true,
          shippedAt: true,
          deliveredAt: true,
          rejectedAt: true,
          rejectionReason: true,
          courseId: true,
          course: { select: { title: true } },
          items: { select: { titleAr: true } },
          shippedBy: { select: { name: true } },
          deliveredBy: { select: { name: true } },
          rejectedBy: { select: { name: true } },
        },
      }),
    ]);

    const entries: StudentHistoryEntry[] = [];

    const push = (
      kind: StudentHistoryKind,
      id: string,
      at: Date,
      fields: Partial<Omit<StudentHistoryEntry, 'key' | 'kind' | 'at'>> = {},
    ) => {
      entries.push({
        key: `${kind}:${id}`,
        kind,
        at: at.toISOString(),
        courseId: null,
        courseTitle: null,
        actorName: null,
        source: null,
        amountCents: null,
        isFree: null,
        plan: null,
        validUntil: null,
        detail: null,
        ...fields,
      });
    };

    if (user) {
      push('account_created', userId, user.createdAt);
      if (user.bannedAt) {
        push('banned', userId, user.bannedAt, {
          actorName: user.bannedBy?.name ?? null,
          detail: user.bannedReason,
        });
      }
    }

    for (const grant of grants) {
      // The platform-wide grant names no course; every other scope does.
      const courseTitle = grant.course?.title ?? (grant.scope === 'platform' ? 'كل الكورسات المفتوحة' : null);
      push('grant_created', grant.id, grant.validFrom, {
        courseId: grant.courseId,
        courseTitle,
        // Only a hand-issued grant has a person behind it worth naming here.
        // A `purchase` grant's reviewer is named on its own approval entry,
        // and `auto_free` has no actor at all.
        actorName: grant.grantedBy?.name ?? null,
        source: grant.source,
        validUntil: grant.validUntil?.toISOString() ?? null,
        detail: grant.note,
      });
      if (grant.revokedAt) {
        push('grant_revoked', grant.id, grant.revokedAt, {
          courseId: grant.courseId,
          courseTitle,
          source: grant.source,
          detail: grant.cancelReason,
        });
      }
    }

    for (const submission of submissions) {
      push('payment_submitted', submission.id, submission.createdAt, {
        courseId: submission.course.id,
        courseTitle: submission.course.title,
        amountCents: submission.amountCents,
        isFree: submission.isFree,
        plan: submission.plan,
      });
      if (submission.reviewedAt && submission.status !== 'pending') {
        push(
          submission.status === 'approved' ? 'payment_approved' : 'payment_rejected',
          submission.id,
          submission.reviewedAt,
          {
            courseId: submission.course.id,
            courseTitle: submission.course.title,
            actorName: submission.reviewedBy?.name ?? null,
            amountCents: submission.amountCents,
            isFree: submission.isFree,
            plan: submission.plan,
            detail: submission.rejectionReason,
          },
        );
      }
    }

    for (const order of orders) {
      // A cart order has no course; its first line stands in, same fallback
      // `BookOrdersService.toDto` already uses for the order's own title.
      const title = order.course?.title ?? order.items[0]?.titleAr ?? null;
      const common = { courseId: order.courseId, courseTitle: title };
      push('book_order_placed', order.id, order.createdAt, {
        ...common,
        amountCents: order.amountCents,
      });
      if (order.paidAt) {
        push('book_order_paid', order.id, order.paidAt, {
          ...common,
          amountCents: order.amountCents,
        });
      }
      if (order.shippedAt) {
        push('book_order_shipped', order.id, order.shippedAt, {
          ...common,
          actorName: order.shippedBy?.name ?? null,
        });
      }
      if (order.deliveredAt) {
        push('book_order_delivered', order.id, order.deliveredAt, {
          ...common,
          actorName: order.deliveredBy?.name ?? null,
        });
      }
      if (order.rejectedAt) {
        push('book_order_rejected', order.id, order.rejectedAt, {
          ...common,
          actorName: order.rejectedBy?.name ?? null,
          detail: order.rejectionReason,
        });
      }
    }

    // Newest first, with `key` as the tie-break so two events stamped in the
    // same millisecond (an approval and the grant it writes, inside one
    // transaction) keep a stable order across reloads rather than swapping.
    return entries.sort((a, b) => (a.at === b.at ? a.key.localeCompare(b.key) : a.at < b.at ? 1 : -1));
  }
}
