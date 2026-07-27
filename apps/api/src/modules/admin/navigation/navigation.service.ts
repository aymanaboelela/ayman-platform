import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  NavigationCreate,
  NavigationItem,
  NavigationPatch,
  NavigationTree,
  Reorder,
} from '@ayman/contracts/admin/navigation';
import { AuditService } from '../../../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AUDIT_RESOURCES } from '../admin.constants';

interface NavRow {
  id: string;
  parentId: string | null;
  labelAr: string;
  href: string;
  icon: string | null;
  position: number;
  visibleTo: string[];
  isPublished: boolean;
}

function toDto(row: NavRow): NavigationItem {
  return {
    id: row.id,
    parentId: row.parentId,
    labelAr: row.labelAr,
    href: row.href,
    icon: row.icon,
    position: row.position,
    visibleTo: row.visibleTo,
    isPublished: row.isPublished,
  };
}

const SELECT = {
  id: true,
  parentId: true,
  labelAr: true,
  href: true,
  icon: true,
  position: true,
  visibleTo: true,
  isPublished: true,
} as const;

@Injectable()
export class NavigationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Public: published, non-archived, two levels deep. */
  async listPublic(): Promise<NavigationTree> {
    const rows = await this.prisma.navigationItem.findMany({
      where: { isPublished: true, archivedAt: null },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: SELECT,
    });
    return this.toTree(rows);
  }

  /** Admin: every non-archived item, published or not — the editor must see drafts. */
  async listAdmin(): Promise<NavigationTree> {
    const rows = await this.prisma.navigationItem.findMany({
      where: { archivedAt: null },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: SELECT,
    });
    return this.toTree(rows);
  }

  private toTree(rows: NavRow[]): NavigationTree {
    const children = new Map<string, NavRow[]>();
    const roots: NavRow[] = [];

    for (const row of rows) {
      if (row.parentId === null) {
        roots.push(row);
      } else {
        const list = children.get(row.parentId) ?? [];
        list.push(row);
        children.set(row.parentId, list);
      }
    }

    return roots.map((root) => ({
      ...toDto(root),
      children: (children.get(root.id) ?? []).map(toDto),
    }));
  }

  async create(input: NavigationCreate): Promise<NavigationItem> {
    const maxPosition = await this.prisma.navigationItem.aggregate({
      where: { parentId: input.parentId, archivedAt: null },
      _max: { position: true },
    });

    const created = await this.prisma.navigationItem.create({
      data: { ...input, position: (maxPosition._max.position ?? -1) + 1 },
      select: SELECT,
    });

    await this.audit.record({
      action: 'nav:create',
      resourceType: AUDIT_RESOURCES.navigationItem,
      resourceId: created.id,
      outcome: 'success',
      metadata: { created: input },
    });

    return toDto(created);
  }

  async patch(id: string, input: NavigationPatch): Promise<NavigationItem> {
    const existing = await this.prisma.navigationItem.findUnique({ where: { id } });
    if (!existing || existing.archivedAt !== null) throw new NotFoundException();

    const updated = await this.prisma.navigationItem.update({
      where: { id },
      data: input,
      select: SELECT,
    });

    await this.audit.record({
      action: 'nav:update',
      resourceType: AUDIT_RESOURCES.navigationItem,
      resourceId: id,
      outcome: 'success',
      metadata: { changed: input },
    });

    return toDto(updated);
  }

  /** Soft delete. Restore is the exact inverse, so undo is a real operation. */
  async archive(id: string): Promise<void> {
    const existing = await this.prisma.navigationItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    await this.prisma.navigationItem.update({ where: { id }, data: { archivedAt: new Date() } });

    await this.audit.record({
      action: 'nav:archive',
      resourceType: AUDIT_RESOURCES.navigationItem,
      resourceId: id,
      outcome: 'success',
    });
  }

  async restore(id: string): Promise<void> {
    const existing = await this.prisma.navigationItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    await this.prisma.navigationItem.update({ where: { id }, data: { archivedAt: null } });

    await this.audit.record({
      action: 'nav:restore',
      resourceType: AUDIT_RESOURCES.navigationItem,
      resourceId: id,
      outcome: 'success',
    });
  }

  /**
   * Spec §5.4: "Reordering 40 lessons is one debounced write of the full
   * ordered id array, not 40 writes." Same rule here — one client request,
   * batched into one Prisma transaction server-side.
   *
   * The set-equality check is what makes this safe: if another admin added
   * or removed an item at this level since the client loaded its list, the
   * arrays differ and this 409s instead of writing positions that reference
   * a list that no longer exists.
   */
  async reorder(input: Reorder): Promise<void> {
    const existing = await this.prisma.navigationItem.findMany({
      where: { parentId: input.parentId, archivedAt: null },
      select: { id: true },
    });

    const currentIds = new Set(existing.map((item) => item.id));
    const sameSize = currentIds.size === input.ids.length;
    const sameMembers = input.ids.every((id) => currentIds.has(id));

    if (!sameSize || !sameMembers) {
      throw new ConflictException('the item list changed; reload and reorder again');
    }

    await this.prisma.$transaction(
      input.ids.map((id, index) =>
        this.prisma.navigationItem.update({ where: { id }, data: { position: index } }),
      ),
    );

    await this.audit.record({
      action: 'nav:reorder',
      resourceType: AUDIT_RESOURCES.navigationItem,
      resourceId: input.parentId,
      outcome: 'success',
      metadata: { order: input.ids },
    });
  }
}
