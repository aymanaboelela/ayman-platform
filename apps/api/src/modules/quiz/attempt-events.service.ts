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
    await tx.$executeRaw`
      INSERT INTO "app"."attempt_events"
        ("attempt_id", "attempt_question_id", "seq", "kind", "payload", "actor_id")
      SELECT
        ${args.attemptId}::text,
        ${args.attemptQuestionId ?? null}::text,
        COALESCE(MAX("seq"), 0) + 1,
        ${args.kind}::"app"."AttemptEventKind",
        ${JSON.stringify(args.payload ?? {})}::jsonb,
        ${args.actorId ?? null}::text
      FROM "app"."attempt_events"
      WHERE "attempt_id" = ${args.attemptId}::text
    `;
  }
}
