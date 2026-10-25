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
    // attempt_id/attempt_question_id are `uuid` columns; actor_id references
    // Better Auth's users.id, which is NOT a uuid (see the id-type-and-
    // delete-path audit), so it stays `::text`.
    await tx.$executeRaw`
      INSERT INTO "app"."attempt_events"
        ("attempt_id", "attempt_question_id", "seq", "kind", "payload", "actor_id", "created_at")
      SELECT
        ${args.attemptId}::uuid,
        ${args.attemptQuestionId ?? null}::uuid,
        COALESCE(MAX("seq"), 0) + 1,
        ${args.kind}::"app"."AttemptEventKind",
        ${JSON.stringify(args.payload ?? {})}::jsonb,
        ${args.actorId ?? null}::text,
        (now() AT TIME ZONE 'UTC')
      FROM "app"."attempt_events"
      WHERE "attempt_id" = ${args.attemptId}::uuid
    `;
  }

  /**
   * Several rows of one kind in ONE statement, numbered `max + 1 … max + n`.
   *
   * For a batch arriving from the browser (the exam runner's signals), where
   * `append` in a loop would hold the `(attempt_id, seq)` slots it has taken
   * open across n round trips. Every other writer on this attempt (a flag, a
   * submit) is competing for the next number in that window, and the loser of
   * a unique-index race is whoever commits second, which may be the submit.
   * One statement keeps the window as short as an insert can make it.
   */
  async appendMany(
    tx: TransactionClient,
    args: {
      attemptId: string;
      kind: AttemptEventKind;
      actorId: string | null;
      rows: ReadonlyArray<{ attemptQuestionId: string | null; payload: Prisma.InputJsonValue }>;
    },
  ): Promise<void> {
    if (args.rows.length === 0) return;
    await tx.$executeRaw`
      INSERT INTO "app"."attempt_events"
        ("attempt_id", "attempt_question_id", "seq", "kind", "payload", "actor_id", "created_at")
      SELECT
        ${args.attemptId}::uuid,
        (row.value->>'attemptQuestionId')::uuid,
        base.max_seq + row.ordinality,
        ${args.kind}::"app"."AttemptEventKind",
        row.value->'payload',
        ${args.actorId}::text,
        (now() AT TIME ZONE 'UTC')
      FROM
        (SELECT COALESCE(MAX("seq"), 0) AS max_seq FROM "app"."attempt_events"
          WHERE "attempt_id" = ${args.attemptId}::uuid) AS base,
        jsonb_array_elements(${JSON.stringify(args.rows)}::jsonb) WITH ORDINALITY AS row
    `;
  }
}
