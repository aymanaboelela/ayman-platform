import { Injectable } from '@nestjs/common';
import type { AuditAction, AuditEntry, AuditOutcome } from '@ayman/contracts/admin/audit';
import { AuditService } from '../../../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';

export interface AuditListQuery {
  page: number;
  perPage: number;
  action: string[];
  resourceType: string | null;
  actorUserId: string | null;
  outcome: string | null;
  from: string | null;
  to: string | null;
}

interface AuditLogRow {
  id: bigint;
  occurredAt: Date;
  actorUserId: string | null;
  actorIp: string | null;
  actorUserAgent: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: string;
  metadata: unknown;
  prevHash: string | null;
  hash: string;
}

/**
 * Read-only. Every WRITE to `audit_log` happens through `AuditService.record`
 * (the global module) — this service exists solely because a viewer needs a
 * different shape (paginated, actor emails joined, chain-verified) than the
 * write path ever needs to produce.
 */
@Injectable()
export class AuditReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * `audit_log.id` is a `bigserial` — `JSON.stringify(1n)` throws
   * `TypeError: Do not know how to serialize a BigInt`, and that failure
   * surfaces as a 500 on the very first list request, which reads exactly
   * like an authorization bug rather than a serialisation one. Mapped
   * explicitly here (a decimal string, matching `AuditEntrySchema.id:
   * z.string()`) rather than patching `BigInt.prototype.toJSON` globally —
   * a global patch would silently change every OTHER BigInt response too,
   * including any future one where a number was actually expected.
   */
  private toDto(row: AuditLogRow, actorEmail: string | null): AuditEntry {
    return {
      id: row.id.toString(),
      occurredAt: row.occurredAt.toISOString(),
      actorUserId: row.actorUserId,
      actorEmail,
      actorIp: row.actorIp,
      action: row.action as AuditAction,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      outcome: row.outcome as AuditOutcome,
      metadata: row.metadata ?? null,
      prevHash: row.prevHash,
      hash: row.hash,
    };
  }

  private buildWhere(query: AuditListQuery): Prisma.AuditLogWhereInput {
    return {
      ...(query.action.length > 0 ? { action: { in: query.action } } : {}),
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
  }

  /**
   * Sorting is `occurredAt` DESC, non-configurable — an append-only chain
   * has exactly one meaningful order, and offering a UI to re-sort it
   * invites the assumption that this is re-orderable data the way a list of
   * students is.
   */
  async list(query: AuditListQuery): Promise<{ rows: AuditEntry[]; rowCount: number }> {
    const where = this.buildWhere(query);

    const [rowCount, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
    ]);

    // `actor_user_id` has no Prisma relation to `User` (the audit log must
    // outlive a deleted account, so it is a plain string, not a foreign
    // key) — the email is joined here, in application code, as a batched
    // lookup rather than N+1 queries per row.
    const actorIds = [...new Set(rows.map((row) => row.actorUserId).filter((id): id is string => id !== null))];
    const actors =
      actorIds.length > 0
        ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } })
        : [];
    const emailById = new Map(actors.map((actor) => [actor.id, actor.email]));

    return {
      rowCount,
      rows: rows.map((row) => this.toDto(row, row.actorUserId ? (emailById.get(row.actorUserId) ?? null) : null)),
    };
  }

  verifyChain(): Promise<{ ok: true } | { ok: false; brokenAtId: string }> {
    return this.audit.verifyChain();
  }
}
