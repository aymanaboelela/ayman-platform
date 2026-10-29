import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminCouponCreateInput,
  AdminCouponList,
  AdminCouponQuery,
  AdminCouponRedemptions,
  AdminCouponRow,
  AdminCouponStatus,
  AdminCouponUpdateInput,
} from '@ayman/contracts/admin/coupons';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { isUniqueViolation } from '../wallet/wallet-ledger';

const ROW_SELECT = {
  id: true,
  code: true,
  kind: true,
  percentOff: true,
  amountOffCents: true,
  allCourses: true,
  startsAt: true,
  endsAt: true,
  maxUses: true,
  maxUsesPerStudent: true,
  usesCount: true,
  isActive: true,
  note: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
  courses: { select: { course: { select: { id: true, title: true } } } },
} as const satisfies Prisma.CouponSelect;

type CouponRecord = Prisma.CouponGetPayload<{ select: typeof ROW_SELECT }>;

/** See `AdminCouponStatusSchema` for the precedence. */
export function couponStatus(
  coupon: Pick<CouponRecord, 'isActive' | 'startsAt' | 'endsAt' | 'maxUses' | 'usesCount'>,
  now: Date,
): AdminCouponStatus {
  if (!coupon.isActive) return 'inactive';
  if (coupon.startsAt !== null && coupon.startsAt > now) return 'scheduled';
  if (coupon.endsAt !== null && coupon.endsAt <= now) return 'expired';
  if (coupon.maxUses !== null && coupon.usesCount >= coupon.maxUses) return 'exhausted';
  return 'active';
}

/**
 * The status filter as a WHERE — the same precedence as `couponStatus`, so a
 * row the list labels «منتهي» is a row the «منتهي» filter returns.
 *
 * `exhausted` compares two columns, which Prisma's where cannot do, so it is
 * resolved to an id list by a raw read first (`exhaustedIds`).
 */
function statusWhere(status: AdminCouponQuery['status'], now: Date, exhausted: string[]): Prisma.CouponWhereInput {
  const started: Prisma.CouponWhereInput = { OR: [{ startsAt: null }, { startsAt: { lte: now } }] };
  const notOver: Prisma.CouponWhereInput = { OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
  switch (status) {
    case 'inactive':
      return { isActive: false };
    case 'scheduled':
      return { isActive: true, startsAt: { gt: now } };
    case 'expired':
      return { isActive: true, AND: [started, { endsAt: { lte: now } }] };
    case 'exhausted':
      return { isActive: true, AND: [started, notOver], id: { in: exhausted } };
    case 'active':
      return { isActive: true, AND: [started, notOver], id: { notIn: exhausted } };
    default:
      return {};
  }
}

/**
 * «كوبونات الخصم» — the admin screen. The money side (spending a use with a
 * claim, giving it back on a rejection) is `coupon-ledger.ts`, called from
 * `PaymentsService`; nothing here moves a use count.
 */
@Injectable()
export class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Coupons that have hit `max_uses` — see `statusWhere`. */
  private async exhaustedIds(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id"::text AS "id" FROM "app"."coupons"
       WHERE "max_uses" IS NOT NULL AND "uses_count" >= "max_uses"
    `;
    return rows.map((row) => row.id);
  }

  /** Piastres given away per coupon, live redemptions only. */
  private async discountGiven(couponIds: string[]): Promise<Map<string, number>> {
    if (couponIds.length === 0) return new Map();
    const sums = await this.prisma.couponRedemption.groupBy({
      by: ['couponId'],
      where: { couponId: { in: couponIds }, releasedAt: null },
      _sum: { discountCents: true },
    });
    return new Map(sums.map((row) => [row.couponId, row._sum.discountCents ?? 0]));
  }

  private toRow(coupon: CouponRecord, given: Map<string, number>, now: Date): AdminCouponRow {
    return {
      id: coupon.id,
      code: coupon.code,
      kind: coupon.kind,
      percentOff: coupon.percentOff,
      amountOffCents: coupon.amountOffCents,
      allCourses: coupon.allCourses,
      courses: coupon.courses.map((link) => ({ id: link.course.id, title: link.course.title })),
      startsAt: coupon.startsAt?.toISOString() ?? null,
      endsAt: coupon.endsAt?.toISOString() ?? null,
      maxUses: coupon.maxUses,
      maxUsesPerStudent: coupon.maxUsesPerStudent,
      usesCount: coupon.usesCount,
      discountGivenCents: given.get(coupon.id) ?? 0,
      isActive: coupon.isActive,
      status: couponStatus(coupon, now),
      note: coupon.note,
      createdAt: coupon.createdAt.toISOString(),
      createdBy: coupon.createdBy,
    };
  }

  async list(query: AdminCouponQuery): Promise<AdminCouponList> {
    const now = new Date();
    const exhausted = await this.exhaustedIds();
    const q = query.q.trim();
    const where: Prisma.CouponWhereInput = {
      ...statusWhere(query.status, now, exhausted),
      ...(q ? { code: { contains: q.toUpperCase() } } : {}),
    };

    const [rowCount, rows, total, active, expired, uses, given] = await Promise.all([
      this.prisma.coupon.count({ where }),
      this.prisma.coupon.findMany({
        where,
        // Newest first, `id` as the tiebreak — two codes made in the same
        // millisecond must not swap places between pages.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        select: ROW_SELECT,
      }),
      this.prisma.coupon.count(),
      this.prisma.coupon.count({ where: statusWhere('active', now, exhausted) }),
      this.prisma.coupon.count({ where: statusWhere('expired', now, exhausted) }),
      this.prisma.coupon.aggregate({ _sum: { usesCount: true } }),
      this.prisma.couponRedemption.aggregate({
        where: { releasedAt: null },
        _sum: { discountCents: true },
      }),
    ]);

    const perCoupon = await this.discountGiven(rows.map((row) => row.id));
    return {
      rows: rows.map((row) => this.toRow(row, perCoupon, now)),
      rowCount,
      stats: {
        total,
        active,
        expired,
        uses: uses._sum.usesCount ?? 0,
        discountGivenCents: given._sum.discountCents ?? 0,
      },
    };
  }

  async create(adminId: string, input: AdminCouponCreateInput): Promise<AdminCouponRow> {
    const courseIds = input.allCourses ? [] : [...new Set(input.courseIds)];
    if (courseIds.length > 0) {
      const found = await this.prisma.course.count({ where: { id: { in: courseIds } } });
      if (found !== courseIds.length) throw new BadRequestException('a selected course does not exist');
    }

    let created: CouponRecord;
    try {
      created = await this.prisma.coupon.create({
        data: {
          code: input.code,
          kind: input.kind,
          percentOff: input.kind === 'percent' ? input.percentOff : null,
          amountOffCents: input.kind === 'fixed' ? input.amountOffCents : null,
          allCourses: input.allCourses,
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          maxUses: input.maxUses,
          maxUsesPerStudent: input.maxUsesPerStudent,
          isActive: input.isActive,
          note: input.note || null,
          createdByUserId: adminId,
          courses: courseIds.length > 0 ? { createMany: { data: courseIds.map((courseId) => ({ courseId })) } } : undefined,
        },
        select: ROW_SELECT,
      });
    } catch (error) {
      // `coupons_code_key` — case-insensitive by construction (stored upper).
      if (isUniqueViolation(error)) throw new ConflictException({ code: 'coupon_code_taken', message: 'code taken' });
      throw error;
    }

    await this.audit.record({
      action: 'coupon:create',
      resourceType: AUDIT_RESOURCES.coupon,
      resourceId: created.id,
      actorUserId: adminId,
      outcome: 'success',
      metadata: {
        code: created.code,
        kind: created.kind,
        percentOff: created.percentOff,
        amountOffCents: created.amountOffCents,
        allCourses: created.allCourses,
        courseIds,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        maxUses: created.maxUses,
        maxUsesPerStudent: created.maxUsesPerStudent,
      },
    });

    return this.toRow(created, new Map(), new Date());
  }

  async update(adminId: string, id: string, input: AdminCouponUpdateInput): Promise<AdminCouponRow> {
    const before = await this.prisma.coupon.findUnique({ where: { id }, select: ROW_SELECT });
    if (!before) throw new NotFoundException();

    const endsAt = input.endsAt === undefined ? undefined : input.endsAt === null ? null : new Date(input.endsAt);
    if (endsAt && before.startsAt && endsAt <= before.startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
    if (input.maxUses !== undefined && input.maxUses !== null && input.maxUses < before.usesCount) {
      throw new ConflictException({ code: 'coupon_max_below_uses', message: 'max uses below uses so far' });
    }

    let updated: CouponRecord;
    try {
      updated = await this.prisma.coupon.update({
        where: { id },
        data: {
          isActive: input.isActive,
          endsAt,
          maxUses: input.maxUses,
          maxUsesPerStudent: input.maxUsesPerStudent,
          note: input.note === undefined ? undefined : input.note || null,
        },
        select: ROW_SELECT,
      });
    } catch (error) {
      /*
        `coupons_uses_within_max` (23514): a ceiling lowered below the uses
        already spent. Read as a 409 the screen can name rather than a 500 —
        checked by the database rather than here, because a use can land
        between any read this method made and its own write.
      */
      if (isCheckViolation(error)) {
        throw new ConflictException({ code: 'coupon_max_below_uses', message: 'max uses below uses so far' });
      }
      throw error;
    }

    await this.audit.record({
      action: 'coupon:update',
      resourceType: AUDIT_RESOURCES.coupon,
      resourceId: id,
      actorUserId: adminId,
      outcome: 'success',
      metadata: {
        code: before.code,
        before: {
          isActive: before.isActive,
          endsAt: before.endsAt?.toISOString() ?? null,
          maxUses: before.maxUses,
          maxUsesPerStudent: before.maxUsesPerStudent,
        },
        after: {
          isActive: updated.isActive,
          endsAt: updated.endsAt?.toISOString() ?? null,
          maxUses: updated.maxUses,
          maxUsesPerStudent: updated.maxUsesPerStudent,
        },
      },
    });

    const given = await this.discountGiven([id]);
    return this.toRow(updated, given, new Date());
  }

  /**
   * Only a code nobody ever used — a typo caught in time. A code with any
   * redemption (released or not) is money history; the FK is RESTRICT, and
   * «إيقاف» is how it stops.
   */
  async remove(adminId: string, id: string): Promise<{ ok: true }> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      select: { code: true, _count: { select: { redemptions: true } } },
    });
    if (!coupon) throw new NotFoundException();
    if (coupon._count.redemptions > 0) {
      throw new ConflictException({ code: 'coupon_has_redemptions', message: 'coupon was used' });
    }
    try {
      await this.prisma.coupon.delete({ where: { id } });
    } catch (error) {
      // A use landed between the count and the delete — the RESTRICT FK.
      if ((error as { code?: string }).code === 'P2003') {
        throw new ConflictException({ code: 'coupon_has_redemptions', message: 'coupon was used' });
      }
      throw error;
    }
    await this.audit.record({
      action: 'coupon:delete',
      resourceType: AUDIT_RESOURCES.coupon,
      resourceId: id,
      actorUserId: adminId,
      outcome: 'success',
      metadata: { code: coupon.code },
    });
    return { ok: true };
  }

  /** The latest 100 uses of one code, newest first. */
  async redemptions(id: string): Promise<AdminCouponRedemptions> {
    const exists = await this.prisma.coupon.count({ where: { id } });
    if (exists === 0) throw new NotFoundException();
    const rows = await this.prisma.couponRedemption.findMany({
      where: { couponId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: {
        id: true,
        submissionId: true,
        originalCents: true,
        discountCents: true,
        releasedAt: true,
        createdAt: true,
        user: { select: { id: true, name: true, phoneNumber: true } },
        course: { select: { id: true, title: true } },
        submission: { select: { status: true, walletTransactionId: true } },
      },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        submissionId: row.submissionId,
        student: { id: row.user.id, name: row.user.name, phone: row.user.phoneNumber },
        course: row.course,
        originalCents: row.originalCents,
        discountCents: row.discountCents,
        submissionStatus: row.submission.status,
        paidFromWallet: row.submission.walletTransactionId !== null,
        releasedAt: row.releasedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}

/** A CHECK constraint refused the write (SQLSTATE 23514), however the driver
 *  adapter chose to wrap it. */
function isCheckViolation(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes('23514') || text.includes('check constraint');
}
