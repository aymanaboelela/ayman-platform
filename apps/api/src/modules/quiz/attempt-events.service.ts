import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AttemptEventKind } from '../../generated/prisma/enums';

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class AttemptEventsService {
  /**
   * Gap-free per-attempt sequence, assigned by the database inside the
   * caller's transaction. Computing `max+1` in JS and inserting would race
   * under two concurrent autosaves and silently drop an event; the unique
   * index on (attempt_id, seq) then turns that race into a visible error
   * instead.
   *
   * `$executeRaw` (tagged template, fully parameterised) — NOT
   * `$executeRawUnsafe`, which the ESLint config hard-fails on.
   */
  async append(
    tx: TransactionClient,
    args: {
      attemptId: string;
      kind: AttemptEventKind;
      payload?: Prisma.InputJsonValue;
      attemptQuestionId?: string | null;
      actorId?: string | null;
    },
  ): Promise<void> {
    // B3/H2: `created_at` is supplied explicitly as a UTC instant, exactly
    // like overdue.service.ts and heartbeat.service.ts already do. Without
    // it, the column falls through to the migration's
    // `DEFAULT CURRENT_TIMESTAMP`, which Postgres casts through the
    // SESSION timezone (Africa/Cairo, +3h on this deployment) into this
    // naive `timestamp(3)` column — every other timestamp in the schema is
    // a true UTC instant, and this append-only ledger is the one whose own
    // migration comment calls its integrity "the property that makes a
    // regrade defensible".
    await tx.$executeRaw`
      INSERT INTO "app"."attempt_events"
        ("attempt_id", "attempt_question_id", "seq", "kind", "payload", "actor_id", "created_at")
      SELECT
        ${args.attemptId}::text,
        ${args.attemptQuestionId ?? null}::text,
        COALESCE(MAX("seq"), 0) + 1,
        ${args.kind}::"app"."AttemptEventKind",
        ${JSON.stringify(args.payload ?? {})}::jsonb,
        ${args.actorId ?? null}::text,
        (now() AT TIME ZONE 'UTC')
      FROM "app"."attempt_events"
      WHERE "attempt_id" = ${args.attemptId}::text
    `;
  }
}
