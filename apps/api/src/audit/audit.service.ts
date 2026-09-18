import { Injectable, Logger } from '@nestjs/common';
import type { AuditAction, AuditOutcome } from '@ayman/contracts/admin/audit';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
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
    return this.prisma.$transaction((tx) => this.recordTx(tx, input));
  }

  /**
   * `record`, against a transaction the CALLER already opened.
   *
   * ## Why this exists
   *
   * `record` opens its own transaction, so a caller already inside one that
   * wanted an audit row had exactly two bad options: nest a second transaction
   * — which checks out a second pooled connection and can deadlock against the
   * first, the failure `PrismaService`'s own pool note describes — or hand-roll
   * the insert. Hand-rolling is the one this codebase must never do:
   * `only-the-service-writes.spec.ts` forbids it, because a row written with a
   * miscomputed `prevHash` breaks `verifyChain` from that point on FOREVER and
   * the table is INSERT-only for the runtime role, so nothing can repair it.
   *
   * Splitting the body out is what makes "audit inside my transaction" a
   * supported thing to want rather than a rule to break. `recomputeScoreTx`
   * exists for the identical reason.
   *
   * ⚠️ The advisory lock is taken HERE, per row, exactly as `record` did — it
   * is transaction-scoped, so a caller writing several rows takes it once and
   * holds it to commit. Two admins writing concurrently still serialise on the
   * chain tail; without it both read the same `prev` and the chain forks.
   */
  async recordTx(tx: Prisma.TransactionClient, input: AuditInput): Promise<AuditRow> {
    const ambient = currentActor();
    const actor: AuditActor = {
      actorUserId: input.actorUserId ?? ambient.actorUserId,
      actorIp: input.actorIp ?? ambient.actorIp,
      actorUserAgent: input.actorUserAgent ?? ambient.actorUserAgent,
      requestId: input.requestId ?? ambient.requestId,
    };

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
  async verifyChain(options?: {
    fromId?: bigint;
  }): Promise<{ ok: true } | { ok: false; brokenAtId: string }> {
    /*
     * ── Verifying a RANGE, and what it does and does not prove ─────────────
     *
     * With no `fromId` this walks from the first row and anchors on `null`,
     * which is the full guarantee: every row intact, no row removed, back to
     * genesis. That is the default, and the only answer worth giving when the
     * question is «هل الترail اتلمس؟».
     *
     * `fromId` starts at that row and takes ITS OWN stored `prevHash` as the
     * anchor. So it proves every link from there forward — no row inside the
     * range altered, none removed from inside it — and proves NOTHING about
     * what came before it. It cannot: the anchor it trusts is a value that
     * lives inside the range being checked.
     *
     * Two reasons it exists, and the second is the one that forced it.
     *
     *   · A full walk is O(table) and re-hashes every row ever written. The
     *     trail only grows, so that endpoint gets slower forever and nothing
     *     ever makes it faster again. A range is what you actually want when
     *     the question is «آخر ساعة نضيفة؟».
     *
     *   · This trail can be UNREPAIRABLY broken by one write, and on the dev
     *     database it already was. `audit.service.spec.ts` asserts that the
     *     runtime role CANNOT run `UPDATE app.audit_log SET outcome =
     *     'tampered'` — no WHERE clause, because the statement is meant to be
     *     rejected. On a machine where the role still held UPDATE it
     *     succeeded, and 135,603 rows took that value. The originals are gone;
     *     no recompute brings them back, and a full `verifyChain()` on that
     *     database is false forever.
     *
     *     (The grant is closed now — `docker-entrypoint.sh` was re-granting
     *     UPDATE and DELETE on every table AFTER `prisma migrate deploy`,
     *     undoing the append-only REVOKEs the migrations had just applied.
     *     `attempt_events` survived through a trigger; `audit_log` had none,
     *     so the trail was writable in production too.)
     *
     *     A spec that asserts over the whole table is therefore asserting on
     *     damage it cannot undo and did not cause. Each one verifies the rows
     *     it wrote itself instead.
     */
    let cursor: bigint | undefined;
    let expectedPrev: string | null = null;

    if (options?.fromId !== undefined) {
      const anchor = await this.prisma.auditLog.findUnique({
        where: { id: options.fromId },
        select: { prevHash: true },
      });
      // A `fromId` naming no row is a caller bug, not an intact chain —
      // `{ ok: true }` would be the most reassuring possible answer to a
      // question nobody asked.
      if (anchor === null) return { ok: false, brokenAtId: options.fromId.toString() };
      expectedPrev = anchor.prevHash;
    }

    // A `where` floor rather than a cursor for the first page: Prisma's cursor
    // is exclusive and has to NAME AN EXISTING ROW, so `fromId - 1` would
    // throw on the very case this is for — a range whose predecessor was the
    // row that got deleted.
    const floor: { id: { gte: bigint } } | undefined =
      options?.fromId === undefined ? undefined : { id: { gte: options.fromId } };

    for (;;) {
      const page = await this.prisma.auditLog.findMany({
        take: VERIFY_PAGE_SIZE,
        where: floor,
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
