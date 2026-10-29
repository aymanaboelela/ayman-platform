import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PROMO_BANNER_MAX,
  cairoDayKey,
  type PromoBanner,
  type PromoBannerCreate,
  type PromoBannerPatch,
  type PromoBannerReorder,
  type PublicPromoBanner,
} from '@ayman/contracts/admin/promo-banners';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';

interface BannerRow {
  id: string;
  title: string | null;
  imageKey: string;
  linkUrl: string | null;
  years: number[];
  isActive: boolean;
  startsOn: Date | null;
  endsOn: Date | null;
  position: number;
  createdAt: Date;
}

/**
 * A `@db.Date` column round-trips as UTC midnight, so the ISO date part IS the
 * stored day — no time zone math on the way out, and none on the way in
 * (`toDate`). The Cairo calendar only matters when deciding what "today" is.
 */
function toDay(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

function toDate(day: string | null): Date | null {
  return day === null ? null : new Date(`${day}T00:00:00.000Z`);
}

function toDto(row: BannerRow): PromoBanner {
  return {
    id: row.id,
    title: row.title,
    imageKey: row.imageKey,
    linkUrl: row.linkUrl,
    years: row.years,
    isActive: row.isActive,
    startsOn: toDay(row.startsOn),
    endsOn: toDay(row.endsOn),
    position: row.position,
    createdAt: row.createdAt.toISOString(),
  };
}

const ORDER = [{ position: 'asc' as const }, { id: 'asc' as const }];

/**
 * «البانرات الترويجية» — one flat ordered list, at most `PROMO_BANNER_MAX`.
 *
 * Shaped like `HomeBlocksService` on purpose (create appends, reorder takes
 * the whole id list, every write is audited) so the two admin screens behave
 * the same way under the instructor's hands.
 */
@Injectable()
export class PromoBannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * What the dashboard gets: active, not yet ended, in order.
   *
   * A banner that has not STARTED is included on purpose — the web caches
   * this list for minutes and checks the window again at render, so a banner
   * starting today must already be in the cached copy at midnight. Ended ones
   * are cut here because they can never come back without an admin write,
   * and that write invalidates the cache.
   */
  async listPublic(now: Date = new Date()): Promise<PublicPromoBanner[]> {
    const today = toDate(cairoDayKey(now));
    const rows = await this.prisma.promoBanner.findMany({
      where: { isActive: true, OR: [{ endsOn: null }, { endsOn: { gte: today! } }] },
      orderBy: ORDER,
    });
    return rows.map((row) => {
      const dto = toDto(row);
      return {
        id: dto.id,
        title: dto.title,
        imageKey: dto.imageKey,
        linkUrl: dto.linkUrl,
        years: dto.years,
        startsOn: dto.startsOn,
        endsOn: dto.endsOn,
      };
    });
  }

  async listAdmin(): Promise<PromoBanner[]> {
    const rows = await this.prisma.promoBanner.findMany({ orderBy: ORDER });
    return rows.map(toDto);
  }

  async create(input: PromoBannerCreate): Promise<PromoBanner> {
    const count = await this.prisma.promoBanner.count();
    if (count >= PROMO_BANNER_MAX) {
      throw new ConflictException(`at most ${PROMO_BANNER_MAX} banners`);
    }
    const max = await this.prisma.promoBanner.aggregate({ _max: { position: true } });

    const created = await this.prisma.promoBanner.create({
      data: {
        title: input.title ?? null,
        imageKey: input.imageKey,
        linkUrl: input.linkUrl ?? null,
        years: input.years ?? [],
        isActive: input.isActive ?? true,
        startsOn: toDate(input.startsOn ?? null),
        endsOn: toDate(input.endsOn ?? null),
        position: (max._max.position ?? -1) + 1,
      },
    });

    await this.audit.record({
      action: 'promo-banner:create',
      resourceType: AUDIT_RESOURCES.promoBanner,
      resourceId: created.id,
      outcome: 'success',
      metadata: { title: created.title, linkUrl: created.linkUrl },
    });

    return toDto(created);
  }

  async patch(id: string, input: PromoBannerPatch): Promise<PromoBanner> {
    const existing = await this.prisma.promoBanner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    // The schema only sees the fields that were sent. Checked against the
    // stored row here so the instructor gets a 400 they can read rather than
    // the table's CHECK surfacing as a 500.
    const startsOn = input.startsOn !== undefined ? input.startsOn : toDay(existing.startsOn);
    const endsOn = input.endsOn !== undefined ? input.endsOn : toDay(existing.endsOn);
    if (startsOn && endsOn && endsOn < startsOn) {
      throw new BadRequestException('endsOn is before startsOn');
    }

    const updated = await this.prisma.promoBanner.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.imageKey !== undefined ? { imageKey: input.imageKey } : {}),
        ...(input.linkUrl !== undefined ? { linkUrl: input.linkUrl } : {}),
        ...(input.years !== undefined ? { years: input.years } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.startsOn !== undefined ? { startsOn: toDate(input.startsOn) } : {}),
        ...(input.endsOn !== undefined ? { endsOn: toDate(input.endsOn) } : {}),
      },
    });

    await this.audit.record({
      action: 'promo-banner:update',
      resourceType: AUDIT_RESOURCES.promoBanner,
      resourceId: id,
      outcome: 'success',
      metadata: { changed: input },
    });

    return toDto(updated);
  }

  /**
   * A hard delete. A banner is a picture and a link — nothing points AT it,
   * and «وقّفه» (`isActive: false`) is the reversible way to take one down.
   * The picture itself stays in the media library.
   */
  async remove(id: string): Promise<void> {
    const existing = await this.prisma.promoBanner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    await this.audit.record({
      action: 'promo-banner:delete',
      resourceType: AUDIT_RESOURCES.promoBanner,
      resourceId: id,
      outcome: 'success',
      metadata: { title: existing.title, imageKey: existing.imageKey, linkUrl: existing.linkUrl },
    });

    await this.prisma.promoBanner.delete({ where: { id } });
  }

  /** The whole ordered list in one write — same set-equality rule as
   *  `HomeBlocksService.reorder`, so a stale screen cannot drop a banner. */
  async reorder(input: PromoBannerReorder): Promise<void> {
    const existing = await this.prisma.promoBanner.findMany({ select: { id: true } });
    const current = new Set(existing.map((row) => row.id));
    const same = current.size === input.ids.length && input.ids.every((id) => current.has(id));
    if (!same) throw new ConflictException('the banner list changed; reload and reorder again');

    await this.prisma.$transaction(
      input.ids.map((id, index) =>
        this.prisma.promoBanner.update({ where: { id }, data: { position: index } }),
      ),
    );

    await this.audit.record({
      action: 'promo-banner:reorder',
      resourceType: AUDIT_RESOURCES.promoBanner,
      resourceId: null,
      outcome: 'success',
      metadata: { order: input.ids },
    });
  }
}
