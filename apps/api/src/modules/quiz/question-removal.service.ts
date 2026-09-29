import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type {
  QuestionRemovalItem,
  QuestionRemovalOutcome,
  QuestionRemovalPlan,
  QuestionRemovalQuiz,
  QuestionRemovalResult,
} from '@ayman/contracts/quiz/question-removal';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { QuestionType } from '../../generated/prisma/enums';

/** `quiz_pools.source_filter` — the same shape `AttemptService` draws with. */
interface PoolSourceFilter {
  categoryIds?: string[];
  types?: QuestionType[];
}

/** Everything the decision needs to know about one bank entry. */
export interface RemovalCandidate {
  id: string;
  categoryId: string;
  stemHtml: string;
  /** Types of its `ready` versions — what a random pool could draw from it. */
  readyTypes: QuestionType[];
  versionIds: string[];
  /** One entry per SLOT (a quiz may hold it twice, once per paper). */
  slotQuizzes: Omit<QuestionRemovalQuiz, 'via'>[];
}

/** A random pool of a PUBLISHED quiz, and what it would have left to draw. */
export interface RemovalPool {
  quiz: Omit<QuestionRemovalQuiz, 'via'>;
  filter: PoolSourceFilter;
  pickCount: number;
  /** Ready versions matching the filter once every removable candidate is gone. */
  availableAfter: number;
}

const STEM_EXCERPT = 140;

/** The dialog renders this as text; markup and runs of whitespace go. */
export function stemExcerpt(html: string): string {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > STEM_EXCERPT ? `${text.slice(0, STEM_EXCERPT - 1)}…` : text;
}

/** Would this pool ever draw this question? Same predicate as the draw itself. */
export function poolDrawsFrom(filter: PoolSourceFilter, candidate: Pick<RemovalCandidate, 'categoryId' | 'readyTypes'>): boolean {
  if (filter.categoryIds?.length && !filter.categoryIds.includes(candidate.categoryId)) return false;
  if (candidate.readyTypes.length === 0) return false;
  if (filter.types?.length && !candidate.readyTypes.some((type) => filter.types!.includes(type))) return false;
  return true;
}

/**
 * The whole decision, with no database in it — so every branch has a unit test.
 *
 * ## Why a quiz that holds the question REFUSES, and never quietly edits the quiz
 *
 * The other option on the table was «remove it from unpublished drafts, refuse
 * only for published ones». It is not taken, for three reasons:
 *
 *  - `isPublished = false` does not mean "nobody sat it". A quiz is unpublished
 *    to fix it, with attempts already on it; dropping a slot there changes what
 *    the paper serves the moment it is republished, and its `sumMarks` with it.
 *  - A draft is a paper the teacher is still building. Deleting from the bank
 *    and finding question ٧ gone from next week's exam is exactly the silent
 *    change this screen must never make.
 *  - The refusal costs one click: it names each quiz and links to it, and the
 *    builder already has «شيل السؤال» on every row.
 *
 * A random pool is the same rule one step removed: if taking these questions
 * out would leave a PUBLISHED quiz's pool with fewer ready questions than it
 * draws, the next student to start that quiz would silently get a shorter paper
 * out of the same total. Only published pools are checked — an unpublished
 * quiz is re-checked by the builder's own publish guard
 * (`pool_cannot_fill_pick_count`), which counts the same way.
 *
 * Otherwise: answered anywhere → archive, so every result that used it keeps
 * rendering; never answered → delete.
 */
export function planRemoval(input: {
  candidates: readonly RemovalCandidate[];
  /** Question versions with any history: an attempt, a game answer, a dealt game round. */
  usedVersionIds: ReadonlySet<string>;
  pools: readonly RemovalPool[];
}): QuestionRemovalItem[] {
  return input.candidates.map((candidate) => {
    const quizzes = new Map<string, QuestionRemovalQuiz>();
    for (const quiz of candidate.slotQuizzes) {
      if (!quizzes.has(quiz.quizId)) quizzes.set(quiz.quizId, { ...quiz, via: 'slot' });
    }
    if (quizzes.size === 0) {
      for (const pool of input.pools) {
        if (pool.availableAfter >= pool.pickCount) continue;
        if (!poolDrawsFrom(pool.filter, candidate)) continue;
        if (!quizzes.has(pool.quiz.quizId)) quizzes.set(pool.quiz.quizId, { ...pool.quiz, via: 'pool' });
      }
    }

    const hasHistory = candidate.versionIds.some((id) => input.usedVersionIds.has(id));
    const outcome: QuestionRemovalOutcome = quizzes.size > 0 ? 'blocked' : hasHistory ? 'archive' : 'delete';
    return {
      bankEntryId: candidate.id,
      stem: stemExcerpt(candidate.stemHtml),
      outcome,
      quizzes: [...quizzes.values()],
    };
  });
}

const QUIZ_REF_SELECT = {
  id: true,
  isPublished: true,
  lesson: { select: { title: true, course: { select: { title: true } } } },
} as const;

function quizRef(quiz: {
  id: string;
  isPublished: boolean;
  lesson: { title: string; course: { title: string } };
}): Omit<QuestionRemovalQuiz, 'via'> {
  return { quizId: quiz.id, title: quiz.lesson.title, courseTitle: quiz.lesson.course.title, isPublished: quiz.isPublished };
}

/**
 * Deleting and restoring bank questions. Its own service rather than more of
 * `QuestionBankService`, because this is the one part of the bank that reads
 * attempts, games and pools — none of which authoring a question needs.
 */
@Injectable()
export class QuestionRemovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** What a delete WOULD do. Read-only; the dialog shows it before the click. */
  async plan(ids: readonly string[]): Promise<QuestionRemovalPlan> {
    const { items, missing } = await this.decide(this.prisma, ids);
    return { items, missing };
  }

  /**
   * Decided again here, inside the write's transaction and with the rows
   * locked — the plan the dialog showed may be a minute old. `FOR UPDATE` on
   * the entries is what makes a concurrent «أضف سؤال من البنك» safe: adding a
   * slot takes a key-share lock on the same row for its foreign key (and
   * `QuizBuilderService.addSlot` checks `archived_at` after taking it), so the
   * two serialise and neither can land half-way through the other.
   */
  async remove(ids: readonly string[]): Promise<QuestionRemovalResult> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "app"."question_bank_entries" WHERE "id" = ANY(${[...ids]}::uuid[]) FOR UPDATE`,
        );
        const { items, missing, categoryOf } = await this.decide(tx, ids);

        const deleteIds = items.filter((item) => item.outcome === 'delete').map((item) => item.bankEntryId);
        const archiveIds = items.filter((item) => item.outcome === 'archive').map((item) => item.bankEntryId);

        // Versions and their options go with the entry (`ON DELETE CASCADE`,
        // and the options freeze trigger lets a cascade through by design).
        // Nothing else references a version that has no history — that is
        // what put it in `deleteIds`.
        if (deleteIds.length > 0) {
          await tx.questionBankEntry.deleteMany({ where: { id: { in: deleteIds } } });
        }
        if (archiveIds.length > 0) {
          await tx.questionBankEntry.updateMany({
            where: { id: { in: archiveIds }, archivedAt: null },
            data: { archivedAt: new Date() },
          });
        }

        // One row per question, not one per click: «مين مسح السؤال ده» is
        // asked about a question, and the audit viewer filters by resource.
        // The stem rides along because after a hard delete it is the only
        // place left that says what the question was.
        for (const item of items) {
          if (item.outcome === 'blocked') continue;
          await this.audit.recordTx(tx, {
            action: 'question:delete',
            resourceType: AUDIT_RESOURCES.questionBankEntry,
            resourceId: item.bankEntryId,
            outcome: 'success',
            metadata: {
              mode: item.outcome === 'delete' ? 'hard' : 'archive',
              categoryId: categoryOf.get(item.bankEntryId) ?? null,
              stem: item.stem,
            },
          });
        }

        return {
          deleted: deleteIds.length,
          archived: archiveIds.length,
          blocked: items.filter((item) => item.outcome === 'blocked'),
          missing,
        };
      },
      // Two hundred questions is two hundred audit rows on one chain lock.
      { timeout: 30_000 },
    );
  }

  /** «رجّعه للبنك» — the undo for an archive. A hard delete has none, by design: nothing used it. */
  async restore(bankEntryId: string): Promise<{ ok: true }> {
    if (!z.uuid().safeParse(bankEntryId).success) throw new NotFoundException();
    const entry = await this.prisma.questionBankEntry.findUnique({
      where: { id: bankEntryId },
      select: { archivedAt: true },
    });
    if (!entry) throw new NotFoundException();
    if (entry.archivedAt === null) return { ok: true };

    await this.prisma.$transaction(async (tx) => {
      await tx.questionBankEntry.update({ where: { id: bankEntryId }, data: { archivedAt: null } });
      await this.audit.recordTx(tx, {
        action: 'question:restore',
        resourceType: AUDIT_RESOURCES.questionBankEntry,
        resourceId: bankEntryId,
        outcome: 'success',
      });
    });
    return { ok: true };
  }

  private async decide(
    db: Prisma.TransactionClient,
    ids: readonly string[],
  ): Promise<{ items: QuestionRemovalItem[]; missing: string[]; categoryOf: Map<string, string> }> {
    const wanted = [...new Set(ids)];
    const entries = await db.questionBankEntry.findMany({
      where: { id: { in: wanted }, archivedAt: null },
      select: {
        id: true,
        categoryId: true,
        versions: {
          orderBy: { version: 'desc' },
          select: { id: true, status: true, type: true, stemHtml: true },
        },
        quizSlots: { select: { quiz: { select: QUIZ_REF_SELECT } } },
      },
    });
    const found = new Set(entries.map((entry) => entry.id));
    const missing = wanted.filter((id) => !found.has(id));

    const candidates: RemovalCandidate[] = entries.map((entry) => ({
      id: entry.id,
      categoryId: entry.categoryId,
      stemHtml: entry.versions[0]?.stemHtml ?? '',
      readyTypes: [...new Set(entry.versions.filter((v) => v.status === 'ready').map((v) => v.type))],
      versionIds: entry.versions.map((v) => v.id),
      slotQuizzes: entry.quizSlots.map((slot) => quizRef(slot.quiz)),
    }));

    const versionIds = candidates.flatMap((candidate) => candidate.versionIds);
    const usedVersionIds = await this.usedVersions(db, versionIds);

    // Only what could actually leave is subtracted from a pool — a question a
    // slot already keeps is staying either way.
    const leaving = candidates.filter((candidate) => candidate.slotQuizzes.length === 0);
    const pools = await this.publishedPools(db, leaving);

    return {
      items: planRemoval({ candidates, usedVersionIds, pools }),
      missing,
      categoryOf: new Map(entries.map((entry) => [entry.id, entry.categoryId])),
    };
  }

  /**
   * Every version with history, out of `versionIds`. Three places a version is
   * remembered:
   *
   *  - `attempt_questions` — a quiz attempt. `RESTRICT`, so a hard delete would
   *    fail anyway; checked here so it archives instead of erroring.
   *  - `game_answers` — `CASCADE`. A hard delete would silently take the
   *    answers, and «مين بيلعب» with them. This is the one that matters.
   *  - `game_sessions.question_ids` — a round already dealt it, and a student
   *    may be about to answer it. No FK at all; the answer would 500.
   */
  private async usedVersions(
    db: Prisma.TransactionClient,
    versionIds: readonly string[],
  ): Promise<Set<string>> {
    if (versionIds.length === 0) return new Set();
    const ids = [...versionIds];
    // One after another, not `Promise.all`: inside the write's transaction all
    // three share ONE connection, and queueing them on it is all a parallel
    // call would do anyway.
    const attempted = await db.attemptQuestion.findMany({
      where: { questionVersionId: { in: ids } },
      select: { questionVersionId: true },
      distinct: ['questionVersionId'],
    });
    const answered = await db.gameAnswer.findMany({
      where: { questionVersionId: { in: ids } },
      select: { questionVersionId: true },
      distinct: ['questionVersionId'],
    });
    const dealt = await db.$queryRaw<Array<{ vid: string }>>(Prisma.sql`
      SELECT DISTINCT dealt."vid"::text AS "vid"
      FROM "app"."game_sessions" s, unnest(s."question_ids") AS dealt("vid")
      WHERE s."question_ids" && ${ids}::uuid[] AND dealt."vid" = ANY(${ids}::uuid[])
    `);
    return new Set([
      ...attempted.map((row) => row.questionVersionId),
      ...answered.map((row) => row.questionVersionId),
      ...dealt.map((row) => row.vid),
    ]);
  }

  /** Random pools of published quizzes that could draw any of `leaving`, with what they would keep. */
  private async publishedPools(
    db: Prisma.TransactionClient,
    leaving: readonly RemovalCandidate[],
  ): Promise<RemovalPool[]> {
    if (leaving.length === 0) return [];
    const pools = await db.quizPool.findMany({
      where: { quiz: { isPublished: true } },
      select: { pickCount: true, sourceFilter: true, quiz: { select: QUIZ_REF_SELECT } },
    });
    const leavingIds = leaving.map((candidate) => candidate.id);

    const relevant: RemovalPool[] = [];
    for (const pool of pools) {
      const filter = (pool.sourceFilter ?? {}) as PoolSourceFilter;
      if (!leaving.some((candidate) => poolDrawsFrom(filter, candidate))) continue;
      // The exact count the builder's publish guard and the draw use, minus
      // what is leaving and what already left.
      const availableAfter = await db.questionVersion.count({
        where: {
          status: 'ready',
          type: filter.types?.length ? { in: filter.types } : undefined,
          bankEntry: {
            archivedAt: null,
            id: { notIn: leavingIds },
            ...(filter.categoryIds?.length ? { categoryId: { in: filter.categoryIds } } : {}),
          },
        },
      });
      relevant.push({ quiz: quizRef(pool.quiz), filter, pickCount: pool.pickCount, availableAfter });
    }
    return relevant;
  }
}
