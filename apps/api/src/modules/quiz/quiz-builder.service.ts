import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { QuizSettings } from '@ayman/contracts/quiz/quiz-settings';
import type { QuestionType } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import { buildReorderSql } from '../content/reorder.sql';
import { PrismaService } from '../../prisma/prisma.service';

type TransactionClient = Prisma.TransactionClient;

interface PoolSourceFilter {
  categoryIds?: string[];
  types?: QuestionType[];
}

@Injectable()
export class QuizBuilderService {
  constructor(private readonly prisma: PrismaService) {}

  private settingsData(settings: QuizSettings) {
    return {
      mode: settings.mode,
      durationSeconds: settings.durationSeconds,
      openFrom: settings.openFrom,
      openUntil: settings.openUntil,
      maxAttempts: settings.maxAttempts,
      gradeMethod: settings.gradeMethod,
      retryCooldownHours: settings.retryCooldownHours,
      passPercent: settings.passPercent,
      shuffleQuestions: settings.shuffleQuestions,
      shuffleOptions: settings.shuffleOptions,
      overdueHandling: settings.overdueHandling,
      graceSeconds: settings.graceSeconds,
      navMethod: settings.navMethod,
      gradeOutOf: settings.gradeOutOf,
      reviewOptions: settings.reviewOptions,
    };
  }

  /**
   * Idempotent per lesson: a quiz is 1:1 with its lesson (Task 2's schema), so
   * a second call updates the existing row rather than violating the unique
   * constraint on `lessonId`. Never touches `sumMarks` — that is exclusively
   * `recomputeSumMarks`'s job, driven by slot writes, never by a settings
   * save. Never touches an in-flight attempt: Q3's persisted `deadlineAt` and
   * every snapshot on `attempt_questions` are untouched by this method,
   * stated here from the builder side.
   */
  async upsertForLesson(lessonId: string, settings: QuizSettings): Promise<string> {
    const existing = await this.prisma.quiz.findUnique({
      where: { lessonId },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.quiz.update({ where: { id: existing.id }, data: this.settingsData(settings) });
      return existing.id;
    }

    const created = await this.prisma.quiz.create({
      data: { lessonId, ...this.settingsData(settings), sumMarks: 0 },
      select: { id: true },
    });
    return created.id;
  }

  /** Existence check ONLY — never mutates. The builder's lesson entry point
   *  needs this so it can decide "redirect straight in" vs. "create with
   *  defaults first", without ever re-running `upsertForLesson` (and its
   *  defaults) over a quiz an instructor has already customised. */
  async findByLesson(lessonId: string): Promise<{ id: string } | null> {
    return this.prisma.quiz.findUnique({ where: { lessonId }, select: { id: true } });
  }

  /** Hydrates the builder screen: settings, denormalised totals, and every
   *  slot/pool with just enough of the underlying question to label a row —
   *  never the answer-bearing columns (this is an authoring read, but there
   *  is no reason to select more than the row needs). */
  async getForEdit(quizId: string) {
    const quiz = await this.prisma.quiz.findUniqueOrThrow({
      where: { id: quizId },
      select: {
        id: true,
        lessonId: true,
        mode: true,
        durationSeconds: true,
        openFrom: true,
        openUntil: true,
        maxAttempts: true,
        gradeMethod: true,
        retryCooldownHours: true,
        passPercent: true,
        shuffleQuestions: true,
        shuffleOptions: true,
        overdueHandling: true,
        graceSeconds: true,
        navMethod: true,
        gradeOutOf: true,
        reviewOptions: true,
        sumMarks: true,
        isPublished: true,
        slots: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            position: true,
            maxMark: true,
            bankEntryId: true,
            poolId: true,
            bankEntry: {
              select: {
                versions: {
                  orderBy: { version: 'desc' },
                  take: 1,
                  select: { type: true, stemHtml: true },
                },
              },
            },
            pool: { select: { name: true, pickCount: true } },
          },
        },
      },
    });

    return {
      id: quiz.id,
      lessonId: quiz.lessonId,
      isPublished: quiz.isPublished,
      sumMarks: Number(quiz.sumMarks),
      settings: {
        mode: quiz.mode,
        durationSeconds: quiz.durationSeconds,
        openFrom: quiz.openFrom,
        openUntil: quiz.openUntil,
        maxAttempts: quiz.maxAttempts,
        gradeMethod: quiz.gradeMethod,
        retryCooldownHours: quiz.retryCooldownHours,
        passPercent: Number(quiz.passPercent),
        shuffleQuestions: quiz.shuffleQuestions,
        shuffleOptions: quiz.shuffleOptions,
        overdueHandling: quiz.overdueHandling,
        graceSeconds: quiz.graceSeconds,
        navMethod: quiz.navMethod,
        gradeOutOf: Number(quiz.gradeOutOf),
        reviewOptions: quiz.reviewOptions,
      },
      slots: quiz.slots.map((slot) => ({
        id: slot.id,
        position: slot.position,
        maxMark: Number(slot.maxMark),
        kind: slot.poolId ? ('pool' as const) : ('question' as const),
        type: slot.bankEntry?.versions[0]?.type ?? null,
        stemHtml: slot.bankEntry?.versions[0]?.stemHtml ?? null,
        poolName: slot.pool?.name ?? null,
        poolPickCount: slot.pool?.pickCount ?? null,
      })),
    };
  }

  async addSlot(
    quizId: string,
    input: { bankEntryId: string; pinnedVersion?: number; maxMark: number },
  ): Promise<string> {
    const slotId = await this.prisma.$transaction(async (tx) => {
      const position = await this.nextPosition(tx, quizId);
      const created = await tx.quizSlot.create({
        data: {
          quizId,
          position,
          bankEntryId: input.bankEntryId,
          pinnedVersion: input.pinnedVersion ?? null,
          maxMark: input.maxMark,
        },
        select: { id: true },
      });
      await this.recomputeSumMarks(tx, quizId);
      return created.id;
    });
    return slotId;
  }

  async addPool(
    quizId: string,
    input: {
      name: string;
      pickCount: number;
      pointsPerQuestion: number;
      sourceFilter: PoolSourceFilter;
    },
  ): Promise<string> {
    const poolId = await this.prisma.$transaction(async (tx) => {
      const pool = await tx.quizPool.create({
        data: {
          quizId,
          name: input.name,
          pickCount: input.pickCount,
          pointsPerQuestion: input.pointsPerQuestion,
          sourceFilter: input.sourceFilter as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      const position = await this.nextPosition(tx, quizId);
      await tx.quizSlot.create({
        data: {
          quizId,
          position,
          poolId: pool.id,
          // Unused for grading (AttemptService.resolveSlots reads
          // `pool.pointsPerQuestion` for a pool slot, never `quizSlot.maxMark`)
          // — required NOT NULL by the schema regardless, so it carries the
          // same per-question value for a builder UI that lists all slots.
          maxMark: input.pointsPerQuestion,
        },
      });
      await this.recomputeSumMarks(tx, quizId);
      return pool.id;
    });
    return poolId;
  }

  async removeSlot(quizId: string, slotId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const slot = await tx.quizSlot.findFirst({
        where: { id: slotId, quizId },
        select: { position: true },
      });
      if (!slot) throw new NotFoundException();

      await tx.quizSlot.delete({ where: { id: slotId } });

      // Close the gap: positions must stay 0..n-1 contiguous, or the runner's
      // slotPosition arithmetic and the navigator's numbering drift apart.
      await tx.$executeRaw`
        UPDATE "app"."quiz_slots"
        SET "position" = "position" - 1
        WHERE "quiz_id" = ${quizId}::text AND "position" > ${slot.position}::int
      `;

      await this.recomputeSumMarks(tx, quizId);
    });
  }

  /**
   * ONE statement, through Plan 3's shared `buildReorderSql` — the SQL-
   * injection whitelist (table/column names) and the `N*2+1` parameter shape
   * both live there. The validation ABOVE the SQL (every id present exactly
   * once, every id in scope) stays here, because it is quiz-specific.
   */
  async reorderSlots(quizId: string, slotIds: string[]): Promise<void> {
    const existing = await this.prisma.quizSlot.findMany({
      where: { quizId },
      select: { id: true },
    });
    const known = new Set(existing.map((slot) => slot.id));
    const unique = new Set(slotIds);
    if (unique.size !== slotIds.length || slotIds.length !== known.size) {
      throw new BadRequestException({ code: 'reorder_must_list_every_slot_once' });
    }
    for (const id of slotIds) {
      if (!known.has(id)) throw new BadRequestException({ code: 'reorder_unknown_slot' });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET CONSTRAINTS "app"."quiz_slots_quiz_id_position_key" DEFERRED`;
      await tx.$executeRaw(buildReorderSql('quiz_slots', 'quiz_id', quizId, slotIds));
    });
  }

  /**
   * Every failure carries a distinct machine-readable `code` so the builder
   * UI can point at the offending row. A draft-only question in a published
   * quiz, or a pool that cannot fill its `pickCount`, means the first student
   * to start gets a 500 — this catches it at publish time, when a human is
   * watching, instead.
   */
  async publish(quizId: string): Promise<void> {
    const quiz = await this.prisma.quiz.findUniqueOrThrow({
      where: { id: quizId },
      select: {
        sumMarks: true,
        slots: {
          select: {
            id: true,
            bankEntryId: true,
            pinnedVersion: true,
            poolId: true,
            pool: { select: { pickCount: true, sourceFilter: true } },
          },
        },
      },
    });

    if (quiz.slots.length === 0) {
      throw new BadRequestException({ code: 'quiz_has_no_slots' });
    }

    for (const slot of quiz.slots) {
      if (slot.bankEntryId) {
        const version = slot.pinnedVersion
          ? await this.prisma.questionVersion.findFirst({
              where: { bankEntryId: slot.bankEntryId, version: slot.pinnedVersion, status: 'ready' },
              select: { id: true },
            })
          : await this.prisma.questionVersion.findFirst({
              where: { bankEntryId: slot.bankEntryId, status: 'ready' },
              select: { id: true },
            });
        if (!version) {
          throw new BadRequestException({ code: 'slot_has_no_ready_version', slotId: slot.id });
        }
        continue;
      }

      if (slot.poolId && slot.pool) {
        const filter = (slot.pool.sourceFilter ?? {}) as PoolSourceFilter;
        const available = await this.prisma.questionVersion.count({
          where: {
            status: 'ready',
            bankEntry: filter.categoryIds?.length
              ? { categoryId: { in: filter.categoryIds } }
              : undefined,
            type: filter.types?.length ? { in: filter.types } : undefined,
          },
        });
        if (available < slot.pool.pickCount) {
          throw new BadRequestException({
            code: 'pool_cannot_fill_pick_count',
            message: `pool cannot satisfy its pickCount (${slot.pool.pickCount} needed, ${available} available)`,
            slotId: slot.id,
          });
        }
      }
    }

    if (Number(quiz.sumMarks) <= 0) {
      throw new BadRequestException({ code: 'sum_marks_must_be_positive' });
    }

    await this.prisma.quiz.update({ where: { id: quizId }, data: { isPublished: true } });
  }

  private async nextPosition(tx: TransactionClient, quizId: string): Promise<number> {
    const aggregate = await tx.quizSlot.aggregate({ where: { quizId }, _max: { position: true } });
    return (aggregate._max.position ?? -1) + 1;
  }

  /**
   * Denormalised so the runner never has to aggregate to show "من 20".
   * Recomputed on EVERY slot write (add/remove/pool-add) — never trusted to
   * stay correct on its own.
   */
  private async recomputeSumMarks(tx: TransactionClient, quizId: string): Promise<void> {
    const slots = await tx.quizSlot.findMany({
      where: { quizId },
      select: {
        maxMark: true,
        poolId: true,
        pool: { select: { pickCount: true, pointsPerQuestion: true } },
      },
    });

    const sumMarks = slots.reduce((total, slot) => {
      if (slot.poolId && slot.pool) {
        return total + slot.pool.pickCount * Number(slot.pool.pointsPerQuestion);
      }
      return total + Number(slot.maxMark);
    }, 0);

    await tx.quiz.update({ where: { id: quizId }, data: { sumMarks } });
  }
}
