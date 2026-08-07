import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { QuizPaper, QuizSettings } from '@ayman/contracts/quiz/quiz-settings';
import type { QuestionType } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import { buildReorderSql } from '../content/reorder.sql';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { PrismaService } from '../../prisma/prisma.service';

type TransactionClient = Prisma.TransactionClient;

interface PoolSourceFilter {
  categoryIds?: string[];
  types?: QuestionType[];
}

@Injectable()
export class QuizBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private settingsData(settings: QuizSettings) {
    return {
      durationSeconds: settings.durationSeconds,
      openFrom: settings.openFrom,
      openUntil: settings.openUntil,
      allowsImprovement: settings.allowsImprovement,
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
        // Only a course's designated final exam may offer an improvement
        // sitting, so the builder needs to know which one it is looking at.
        // Read here rather than inferred in the UI from the lesson's title or
        // position — `Course.examLessonId` is the only thing that decides it.
        lesson: { select: { course: { select: { examLessonId: true } } } },
        durationSeconds: true,
        openFrom: true,
        openUntil: true,
        allowsImprovement: true,
        passPercent: true,
        shuffleQuestions: true,
        shuffleOptions: true,
        overdueHandling: true,
        graceSeconds: true,
        navMethod: true,
        gradeOutOf: true,
        reviewOptions: true,
        sumMarks: true,
        improvementSumMarks: true,
        isPublished: true,
        slots: {
          orderBy: [{ paper: 'asc' }, { position: 'asc' }],
          select: {
            id: true,
            paper: true,
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
      isCourseExam: quiz.lesson.course.examLessonId === quiz.lessonId,
      isPublished: quiz.isPublished,
      sumMarks: Number(quiz.sumMarks),
      improvementSumMarks: Number(quiz.improvementSumMarks),
      settings: {
        durationSeconds: quiz.durationSeconds,
        openFrom: quiz.openFrom,
        openUntil: quiz.openUntil,
        allowsImprovement: quiz.allowsImprovement,
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
        paper: slot.paper,
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
    input: { bankEntryId: string; pinnedVersion?: number; maxMark: number; paper?: QuizPaper },
  ): Promise<string> {
    const paper = input.paper ?? 'original';
    await this.assertPaperAllowed(quizId, paper);

    const slotId = await this.prisma.$transaction(async (tx) => {
      const position = await this.nextPosition(tx, quizId, paper);
      const created = await tx.quizSlot.create({
        data: {
          quizId,
          paper,
          position,
          bankEntryId: input.bankEntryId,
          pinnedVersion: input.pinnedVersion ?? null,
          maxMark: input.maxMark,
        },
        select: { id: true },
      });
      await this.recomputeSumMarks(tx, quizId, paper);
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
      paper?: QuizPaper;
    },
  ): Promise<string> {
    const paper = input.paper ?? 'original';
    await this.assertPaperAllowed(quizId, paper);

    const poolId = await this.prisma.$transaction(async (tx) => {
      const pool = await tx.quizPool.create({
        data: {
          quizId,
          paper,
          name: input.name,
          pickCount: input.pickCount,
          pointsPerQuestion: input.pointsPerQuestion,
          sourceFilter: input.sourceFilter as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      const position = await this.nextPosition(tx, quizId, paper);
      await tx.quizSlot.create({
        data: {
          quizId,
          // Must match the pool's — `quiz_slots_pool_paper_matches` is a real
          // composite FK and would reject the row otherwise.
          paper,
          position,
          poolId: pool.id,
          // Unused for grading (AttemptService.resolveSlots reads
          // `pool.pointsPerQuestion` for a pool slot, never `quizSlot.maxMark`)
          // — required NOT NULL by the schema regardless, so it carries the
          // same per-question value for a builder UI that lists all slots.
          maxMark: input.pointsPerQuestion,
        },
      });
      await this.recomputeSumMarks(tx, quizId, paper);
      return pool.id;
    });
    return poolId;
  }

  async removeSlot(quizId: string, slotId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const slot = await tx.quizSlot.findFirst({
        where: { id: slotId, quizId },
        select: { position: true, paper: true },
      });
      if (!slot) throw new NotFoundException();

      await tx.quizSlot.delete({ where: { id: slotId } });

      // Close the gap: positions must stay 0..n-1 contiguous, or the runner's
      // slotPosition arithmetic and the navigator's numbering drift apart.
      // Scoped to the slot's OWN paper — without that clause, deleting question
      // 2 of the original paper silently renumbers the improvement paper too.
      await tx.$executeRaw`
        UPDATE "app"."quiz_slots"
        SET "position" = "position" - 1
        WHERE "quiz_id" = ${quizId}::uuid
          AND "paper" = ${slot.paper}::"app"."quiz_paper"
          AND "position" > ${slot.position}::int
      `;

      await this.recomputeSumMarks(tx, quizId, slot.paper);
    });
  }

  /**
   * ONE statement, through Plan 3's shared `buildReorderSql` — the SQL-
   * injection whitelist (table/column names) and the `N*2+1` parameter shape
   * both live there. The validation ABOVE the SQL (every id present exactly
   * once, every id in scope) stays here, because it is quiz-specific.
   */
  async reorderSlots(quizId: string, slotIds: string[], paper: QuizPaper = 'original'): Promise<void> {
    // Scoped to ONE paper. The completeness check below compares the submitted
    // list against the slots of THAT paper — reordering the original while the
    // improvement paper exists would otherwise look like a list missing half
    // its slots and be rejected, and a list spanning both would renumber two
    // independent sequences into one.
    const existing = await this.prisma.quizSlot.findMany({
      where: { quizId, paper },
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
      await tx.$executeRaw`SET CONSTRAINTS "app"."quiz_slots_quiz_id_paper_position_key" DEFERRED`;
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
        improvementSumMarks: true,
        allowsImprovement: true,
        slots: {
          select: {
            id: true,
            paper: true,
            bankEntryId: true,
            pinnedVersion: true,
            poolId: true,
            pool: { select: { pickCount: true, sourceFilter: true } },
          },
        },
      },
    });

    const original = quiz.slots.filter((slot) => slot.paper === 'original');
    const improvement = quiz.slots.filter((slot) => slot.paper === 'improvement');

    if (original.length === 0) {
      throw new BadRequestException({ code: 'quiz_has_no_slots' });
    }

    if (quiz.allowsImprovement) {
      // An improvement sitting a student cannot actually sit is worse than no
      // improvement at all: they are told they have a second chance, spend it,
      // and are handed a blank paper.
      if (improvement.length === 0) {
        throw new BadRequestException({ code: 'improvement_paper_empty' });
      }

      /*
       * The refusal this whole feature exists for. An improvement paper built
       * from the original's questions is not an improvement exam — it is the
       * same exam with the answers already known, and a student who sat the
       * original in the morning would score full marks on it by memory.
       *
       * Only FIXED slots can be compared this way. Two pools drawing from the
       * same category may still overlap, which is why the student-facing copy
       * says the questions "will be different" rather than promising they are
       * disjoint, and why the admin is told to build a genuinely separate set.
       */
      const originalEntries = new Set(
        original.map((slot) => slot.bankEntryId).filter((id): id is string => id !== null),
      );
      const shared = improvement.filter(
        (slot) => slot.bankEntryId !== null && originalEntries.has(slot.bankEntryId),
      );
      if (shared.length > 0) {
        throw new BadRequestException({
          code: 'improvement_paper_shares_questions',
          sharedCount: shared.length,
          slotIds: shared.map((slot) => slot.id),
        });
      }

      if (Number(quiz.improvementSumMarks) <= 0) {
        throw new BadRequestException({ code: 'improvement_sum_marks_must_be_positive' });
      }
    } else if (improvement.length > 0) {
      // Turning improvement back off with a paper still attached would leave
      // questions no student can ever be served — silently, and for good.
      throw new BadRequestException({ code: 'improvement_paper_orphaned' });
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

    await this.audit.record({
      action: 'quiz:publish',
      resourceType: AUDIT_RESOURCES.quiz,
      resourceId: quizId,
      outcome: 'success',
      metadata: {
        slots: original.length,
        improvementSlots: improvement.length,
        sumMarks: Number(quiz.sumMarks),
        improvementSumMarks: Number(quiz.improvementSumMarks),
      },
    });
  }

  /** Per paper — each numbers its own questions from zero. */
  private async nextPosition(
    tx: TransactionClient,
    quizId: string,
    paper: QuizPaper,
  ): Promise<number> {
    const aggregate = await tx.quizSlot.aggregate({
      where: { quizId, paper },
      _max: { position: true },
    });
    return (aggregate._max.position ?? -1) + 1;
  }

  /**
   * Only a course's final exam may carry an improvement paper.
   *
   * Checked on the WRITE rather than only at publish: an instructor who builds
   * a whole improvement paper on an ordinary lesson quiz and is told at the end
   * that it was never allowed has wasted real work.
   */
  private async assertPaperAllowed(quizId: string, paper: QuizPaper): Promise<void> {
    if (paper === 'original') return;
    const quiz = await this.prisma.quiz.findUniqueOrThrow({
      where: { id: quizId },
      select: { allowsImprovement: true },
    });
    if (!quiz.allowsImprovement) {
      throw new BadRequestException({ code: 'improvement_not_enabled' });
    }
  }

  /**
   * Denormalised so the runner never has to aggregate to show "من 20".
   * Recomputed on EVERY slot write (add/remove/pool-add) — never trusted to
   * stay correct on its own.
   *
   * Per paper, into its own column. A single total across both would tell a
   * student facing a 10-question original that it is marked out of double.
   */
  private async recomputeSumMarks(
    tx: TransactionClient,
    quizId: string,
    paper: QuizPaper,
  ): Promise<void> {
    const slots = await tx.quizSlot.findMany({
      where: { quizId, paper },
      select: {
        maxMark: true,
        poolId: true,
        pool: { select: { pickCount: true, pointsPerQuestion: true } },
      },
    });

    const total = slots.reduce((sum, slot) => {
      if (slot.poolId && slot.pool) {
        return sum + slot.pool.pickCount * Number(slot.pool.pointsPerQuestion);
      }
      return sum + Number(slot.maxMark);
    }, 0);

    await tx.quiz.update({
      where: { id: quizId },
      data: paper === 'improvement' ? { improvementSumMarks: total } : { sumMarks: total },
    });
  }
}
