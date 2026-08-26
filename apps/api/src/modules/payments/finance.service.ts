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
      scope: 'course',
      // A manually revoked grant is no longer a subscription anybody is
      // paying for — the same reason `PaymentsService.approve` only ever
      // looks at `revokedAt: null` when deciding whether to extend one.
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
        // the oldest pending claim.
        orderBy: [{ validUntil: 'asc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        select: {
          id: true,
          userId: true,
          courseId: true,
          validUntil: true,
          user: { select: { name: true } },
          course: { select: { title: true } },
          // The most recent APPROVED submission behind this grant — its
          // plan, amount and review date are what "paid X on Y" means here.
          // `take: 1` keeps this one row per grant rather than one per
          // payment; a renewal's earlier submissions are `/admin/payments`'s
          // job to show.
          paymentSubmissions: {
            where: { status: 'approved' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { plan: true, amountCents: true, reviewedAt: true },
          },
        },
      }),
      this.prisma.accessGrant.count({ where: { ...base, validUntil: { gt: now } } }),
      this.prisma.accessGrant.count({
        where: { ...base, validUntil: { gte: now, lte: soon } },
      }),
      this.prisma.paymentSubmission.aggregate({
        where: { status: 'approved', reviewedAt: { gte: monthRangeUTC(now).start, lt: monthRangeUTC(now).end } },
        _sum: { amountCents: true },
      }),
    ]);

    return {
      rowCount,
      // `courseId`/`course`/`validUntil` are nullable on `AccessGrant` in
      // general (a `subject_teacher` grant has no single course; a `null`
      // `validUntil` means open-ended) but never for a row THIS where clause
      // can return — `scope: 'course'` guarantees the course, and
      // `source: 'purchase'` grants always write a real `validUntil` (see
      // `PaymentsService.approve`). A row missing either is dropped rather
      // than rendered with a blank cell — the type system cannot see the
      // guarantee the query makes, but nothing here should trust it blindly.
      rows: grants
        .filter(
          (grant): grant is typeof grant & { courseId: string; course: { title: string }; validUntil: Date } =>
            grant.courseId !== null && grant.course !== null && grant.validUntil !== null,
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
            amountCents: latest?.amountCents ?? null,
            paidAt: latest?.reviewedAt?.toISOString() ?? null,
            validUntil: grant.validUntil.toISOString(),
            status: financeStatusFor(grant.validUntil, now),
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

function statusWhere(
  status: AdminFinanceQuery['status'],
  now: Date,
  soon: Date,
): Prisma.AccessGrantWhereInput {
  switch (status) {
    case 'expired':
      return { validUntil: { lt: now } };
    case 'expiring_soon':
      return { validUntil: { gte: now, lte: soon } };
    case 'active':
      return { validUntil: { gt: soon } };
    default:
      return {};
  }
}
