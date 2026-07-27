import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  HomeBlockPropsSchema,
  type HomeBlock,
  type HomeBlockCreate,
  type HomeBlockList,
  type HomeBlockPatch,
  type HomeBlockReorder,
} from '@ayman/contracts/admin/home-blocks';
import { AuditService } from '../../../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AUDIT_RESOURCES } from '../admin.constants';

interface BlockRow {
  id: string;
  key: string;
  position: number;
  isPublished: boolean;
  props: unknown;
}

function toDto(row: BlockRow): HomeBlock {
  return {
    id: row.id,
    key: row.key,
    position: row.position,
    isPublished: row.isPublished,
    // The DB's `type` column is denormalised from `props.type` purely so a
    // future admin list can filter/sort by block type in SQL; `props`
    // itself (validated on every write) is always the source of truth for
    // rendering, so the DTO re-parses it rather than trusting the column.
    props: HomeBlockPropsSchema.parse(row.props),
  };
}

const SELECT = { id: true, key: true, position: true, isPublished: true, props: true } as const;

@Injectable()
export class HomeBlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Public: published, non-archived only — an unpublished draft must never
   *  ship inside the RSC payload, or it is readable in view-source. */
  async listPublic(): Promise<HomeBlockList> {
    const rows = await this.prisma.homeBlock.findMany({
      where: { isPublished: true, archivedAt: null },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: SELECT,
    });
    return rows.map(toDto);
  }

  async listAdmin(): Promise<HomeBlockList> {
    const rows = await this.prisma.homeBlock.findMany({
      where: { archivedAt: null },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: SELECT,
    });
    return rows.map(toDto);
  }

  async create(input: HomeBlockCreate): Promise<HomeBlock> {
    const maxPosition = await this.prisma.homeBlock.aggregate({
      where: { archivedAt: null },
      _max: { position: true },
    });

    const created = await this.prisma.homeBlock.create({
      data: {
        key: input.key,
        type: input.props.type,
        props: input.props,
        isPublished: input.isPublished,
        position: (maxPosition._max.position ?? -1) + 1,
      },
      select: SELECT,
    });

    await this.audit.record({
      action: 'home-block:create',
      resourceType: AUDIT_RESOURCES.homeBlock,
      resourceId: created.id,
      outcome: 'success',
      metadata: { key: input.key, type: input.props.type },
    });

    return toDto(created);
  }

  async patch(id: string, input: HomeBlockPatch): Promise<HomeBlock> {
    const existing = await this.prisma.homeBlock.findUnique({ where: { id } });
    if (!existing || existing.archivedAt !== null) throw new NotFoundException();

    const updated = await this.prisma.homeBlock.update({
      where: { id },
      data: {
        ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
        ...(input.props !== undefined ? { props: input.props, type: input.props.type } : {}),
      },
      select: SELECT,
    });

    await this.audit.record({
      action: 'home-block:update',
      resourceType: AUDIT_RESOURCES.homeBlock,
      resourceId: id,
      outcome: 'success',
      metadata: { changed: input },
    });

    return toDto(updated);
  }

  async setPublished(id: string, isPublished: boolean): Promise<HomeBlock> {
    const existing = await this.prisma.homeBlock.findUnique({ where: { id } });
    if (!existing || existing.archivedAt !== null) throw new NotFoundException();

    const updated = await this.prisma.homeBlock.update({ where: { id }, data: { isPublished }, select: SELECT });

    await this.audit.record({
      action: isPublished ? 'home-block:publish' : 'home-block:unpublish',
      resourceType: AUDIT_RESOURCES.homeBlock,
      resourceId: id,
      outcome: 'success',
    });

    return toDto(updated);
  }

  async archive(id: string): Promise<void> {
    const existing = await this.prisma.homeBlock.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    await this.prisma.homeBlock.update({ where: { id }, data: { archivedAt: new Date() } });

    await this.audit.record({
      action: 'home-block:archive',
      resourceType: AUDIT_RESOURCES.homeBlock,
      resourceId: id,
      outcome: 'success',
    });
  }

  async restore(id: string): Promise<void> {
    const existing = await this.prisma.homeBlock.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    await this.prisma.homeBlock.update({ where: { id }, data: { archivedAt: null } });

    await this.audit.record({
      action: 'home-block:restore',
      resourceType: AUDIT_RESOURCES.homeBlock,
      resourceId: id,
      outcome: 'success',
    });
  }

  /** One write of the whole ordered array — home blocks are a single flat
   *  list, so there is no parent scope to key the set-equality check on. */
  async reorder(input: HomeBlockReorder): Promise<void> {
    const existing = await this.prisma.homeBlock.findMany({
      where: { archivedAt: null },
      select: { id: true },
    });

    const currentIds = new Set(existing.map((item) => item.id));
    const sameSize = currentIds.size === input.ids.length;
    const sameMembers = input.ids.every((id) => currentIds.has(id));

    if (!sameSize || !sameMembers) {
      throw new ConflictException('the block list changed; reload and reorder again');
    }

    await this.prisma.$transaction(
      input.ids.map((id, index) => this.prisma.homeBlock.update({ where: { id }, data: { position: index } })),
    );

    await this.audit.record({
      action: 'home-block:reorder',
      resourceType: AUDIT_RESOURCES.homeBlock,
      resourceId: null,
      outcome: 'success',
      metadata: { order: input.ids },
    });
  }
}
