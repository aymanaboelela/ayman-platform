import { Injectable, Logger } from '@nestjs/common';
import type { AuditAction, AuditOutcome } from '@ayman/contracts/admin/audit';
import { PrismaService } from '../prisma/prisma.service';
import { currentActor, type AuditActor } from './audit-context';
import { GENESIS_HASH, chainHash } from './chain';

/**
 * What the call site must say. The actor fields are optional and default to
 * the ambient request context (`audit-context.ts`) — a call site that omits
 * them records the real caller, not a null one. Passing them explicitly is
 * still supported for the cases where the actor is not the HTTP caller.
 */
export interface AuditInput extends Partial<AuditActor> {
  action: AuditAction;
  resourceType: string;
  resourceId: string | null;
  outcome: AuditOutcome;
  metadata?: unknown;
}

export interface AuditRow {
  id: bigint;
  prevHash: string | null;
  hash: string;
}

/** Everything an HTTP handler knows about the caller, minus the action itself. */
export type AuditContext = AuditActor;

/**
 * A fixed 64-bit key for pg_advisory_xact_lock. Two concurrent admins writing
 * audit entries must serialise on the chain tail, otherwise both read the same
 * `prev` and the chain forks — after which verification fails forever through
 * no fault of anyone. The lock is transaction-scoped, so it releases on commit
 * or rollback without any cleanup path.
 */
const AUDIT_CHAIN_LOCK = 7_260_726n;

/** Bounded page size so verifying a large table never needs it all in memory. */
const VERIFY_PAGE_SIZE = 500;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<AuditRow> {
    const ambient = currentActor();
    const actor: AuditActor = {
      actorUserId: input.actorUserId ?? ambient.actorUserId,
      actorIp: input.actorIp ?? ambient.actorIp,
      actorUserAgent: input.actorUserAgent ?? ambient.actorUserAgent,
      requestId: input.requestId ?? ambient.requestId,
    };

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK}::bigint)`;

      const previous = await tx.auditLog.findFirst({
        orderBy: { id: 'desc' },
        select: { hash: true },
      });

      const occurredAt = new Date();
      const prevHash = previous?.hash ?? null;

      const hash = chainHash(prevHash ?? GENESIS_HASH, {
        occurredAt: occurredAt.toISOString(),
        actorUserId: actor.actorUserId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        outcome: input.outcome,
        metadata: input.metadata ?? null,
      });

      return tx.auditLog.create({
        data: {
          occurredAt,
          actorUserId: actor.actorUserId,
          actorIp: actor.actorIp,
          actorUserAgent: actor.actorUserAgent,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          outcome: input.outcome,
          metadata: (input.metadata ?? null) as never,
          requestId: actor.requestId,
          prevHash,
          hash,
        },
        select: { id: true, prevHash: true, hash: true },
      });
    });
  }

  /**
   * Walks the chain in id order and recomputes every hash. Returns the id of
   * the first row whose stored hash does not match its recomputed one — which
   * is where the tampering (or the deletion) happened.
   *
   * Two independent checks per row: the recomputed hash must match the stored
   * one (the row's own contents are intact) AND `prevHash` must equal the
   * previous row's `hash` (no row was removed from the middle). A deletion
   * leaves the first check passing and the second failing, which is exactly
   * why both are needed.
   */
  async verifyChain(): Promise<{ ok: true } | { ok: false; brokenAtId: string }> {
    let cursor: bigint | undefined;
    let expectedPrev: string | null = null;

    for (;;) {
      const page = await this.prisma.auditLog.findMany({
        take: VERIFY_PAGE_SIZE,
        ...(cursor === undefined ? {} : { skip: 1, cursor: { id: cursor } }),
        orderBy: { id: 'asc' },
      });

      if (page.length === 0) return { ok: true };

      for (const row of page) {
        const recomputed = chainHash(row.prevHash ?? GENESIS_HASH, {
          occurredAt: row.occurredAt.toISOString(),
          actorUserId: row.actorUserId,
          action: row.action,
          resourceType: row.resourceType,
          resourceId: row.resourceId,
          outcome: row.outcome,
          metadata: row.metadata ?? null,
        });

        if (recomputed !== row.hash || row.prevHash !== expectedPrev) {
          this.logger.error(`Audit chain broken at id ${row.id}`);
          return { ok: false, brokenAtId: row.id.toString() };
        }

        expectedPrev = row.hash;
      }

      cursor = page[page.length - 1]!.id;
    }
  }
}
