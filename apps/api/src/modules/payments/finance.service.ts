import { Injectable } from '@nestjs/common';
import type {
  AdminFinanceQuery,
  AdminFinanceRow,
  AdminFinanceSummary,
} from '@ayman/contracts/admin/finance';
import { PrismaService } from '../../prisma/prisma.service';
import { EXPIRING_SOON_WINDOW_MS, financeStatusFor, monthRangeUTC } from './finance-status';
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
 */
@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

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

    const [rowCount, grants, activeCount, expiringSoonCount, revenue] = await this.prisma.$transaction([
      this.prisma.accessGrant.count({ where }),
      this.prisma.accessGrant.findMany({
        where,
        // Soonest-expiring first — the rows most worth his attention lead the
        // page, same convention as the payments review queue leading with
        // the oldest pending claim. A `null` `validUntil` (every term grant)
        // sorts last in Postgres's default `ASC` ordering, which is correct:
        // it never needs urgent attention.
        orderBy: [{ validUntil: 'asc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        select: {
          id: true,
          userId: true,
          courseId: true,
          termId: true,
          scope: true,
          validUntil: true,
          user: { select: { name: true } },
          course: { select: { title: true } },
          term: { select: { title: true } },
          // The most recent APPROVED submission behind this grant — its
          // plan, amount and review date are what "paid X on Y" means here.
          // `take: 1` keeps this one row per grant rather than one per
          // payment; a renewal's earlier submissions are `/admin/payments`'s
          // job to show.
          paymentSubmissions: {
            where: { status: 'approved' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { plan: true, amountCents: true, reviewedAt: true, isFree: true },
          },
        },
      }),
      // Every LIVE term grant counts as "active" unconditionally — see
      // `statusForGrant`.
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
          isFree: false,
          reviewedAt: { gte: monthRangeUTC(now).start, lt: monthRangeUTC(now).end },
        },
        _sum: { amountCents: true },
      }),
    ]);

    return {
      rowCount,
      // `courseId`/`course` are nullable on `AccessGrant` in general (a
      // `subject_teacher` grant has no single course) but never for a row
      // THIS where clause can return — `scope: { in: ['course', 'term'] }`
      // guarantees the course either way. `validUntil` genuinely IS null for
      // every `term` row (see the model doc), so it is no longer part of
      // this guard. A row missing course info is dropped rather than
      // rendered with a blank cell — the type system cannot see the
      // guarantee the query makes, but nothing here should trust it blindly.
      rows: grants
        .filter(
          (grant): grant is typeof grant & { courseId: string; course: { title: string } } =>
            grant.courseId !== null && grant.course !== null,
        )
        .map((grant) => {
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
            status: statusForGrant(grant, now),
          };
        }),
      summary: {
        revenueThisMonthCents: revenue._sum.amountCents ?? 0,
        activeCount,
        expiringSoonCount,
      },
    };
  }
}

/**
 * A `term` grant is always `'active'` while it is on this screen at all —
 * the base query's `revokedAt: null` is the only gate it is ever subject to
 * (closing the term is what sets that), and it has no `validUntil` to
 * measure a countdown against. Only a `course` grant goes through the real
 * date math.
 */
function statusForGrant(
  grant: { scope: 'course' | 'term' | 'platform' | 'subject_teacher' | 'unassigned'; validUntil: Date | null },
  now: Date,
): AdminFinanceRow['status'] {
  if (grant.scope === 'term') return 'active';
  // Guaranteed non-null for a `course`-scope `purchase` grant — see the
  // model doc on `AccessGrant.validUntil`.
  return financeStatusFor(grant.validUntil as Date, now);
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
