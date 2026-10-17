import { Injectable, NotFoundException } from '@nestjs/common';
import {
  EMPTY_REGRADE_RESULT,
  addRegradeResults,
  type PublishQuizEditsResult,
  type RegradePreview,
  type RegradeResult,
} from '@ayman/contracts/quiz/regrade';
import { Prisma } from '../../generated/prisma/client';
import type { AttemptState, QuestionType } from '../../generated/prisma/enums';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { LessonProgressService } from '../progress/lesson-progress.service';
import { AttemptService } from './attempt.service';
import { clamp, roundMark } from './grading';
import { mapOptionsBetweenVersions, remapOptionOrder, remapResponse, type MappableOption } from './grading/remap';
import { QuestionBankService } from './question-bank.service';

/**
 * «صحّح من جديد» — see `@ayman/contracts/quiz/regrade` for why it exists.
 *
 * ## What moves
 *
 * Every answer to this bank question that sits on an OLDER version than the
 * latest published one, in a paper that still counts: handed in
 * (`submitted`, `pending_review`) or still being sat (`in_progress`,
 * `overdue`). An abandoned paper has no marks to correct.
 *
 * A handed-in answer is moved AND marked again, through
 * `AttemptService.gradeAndStoreQuestion` — the one grading path — and the
 * paper's total is recomputed by `recomputeScoreTx`, the same function a
 * hand-marked essay goes through. A paper still being sat is only moved: it
 * is marked at submit, and from now on against the corrected key.
 *
 * ## What never moves
 *
 *   · an essay — a human marks those, and their mark is a judgement no key
 *     edit touches;
 *   · a mark a teacher set by hand (`gradedBy` is not null) — the teacher's
 *     own decision outranks an automatic one;
 *   · an answer that names an option with no counterpart in the new version
 *     (`grading/remap.ts`) — rather than guess, it keeps the version and the
 *     mark it had. «Never half-move a grade» is the rule.
 *
 * ## Locking
 *
 * One transaction per PAPER, never one for the whole question: an exam's
 * question can sit in hundreds of papers, and a single transaction would hold
 * all of them while students are still saving answers. Each paper is locked
 * the way `saveAnswers`/`submit` lock it — the `quiz_attempts` row FIRST,
 * then its questions — so a regrade racing an autosave queues behind it
 * instead of deadlocking with it (the ABBA case `saveAnswers` documents).
 */

/** Papers whose answers a correction should reach. */
const MOVABLE_STATES: readonly AttemptState[] = ['in_progress', 'overdue', 'submitted', 'pending_review'];
const FINISHED_STATES: ReadonlySet<AttemptState> = new Set<AttemptState>(['submitted', 'pending_review']);

/** Types whose answers are option ids and can be carried across. */
const CHOICE_TYPES: ReadonlySet<QuestionType> = new Set<QuestionType>(['mcq_single', 'mcq_multi', 'true_false']);

const VERSION_SELECT = {
  id: true,
  version: true,
  type: true,
  settings: true,
  options: {
    orderBy: { position: 'asc' as const },
    select: { id: true, bodyHtml: true, position: true, fraction: true, answerPattern: true, feedbackHtml: true },
  },
} as const;

type FullVersion = Prisma.QuestionVersionGetPayload<{ select: typeof VERSION_SELECT }>;

/**
 * The answers a regrade can actually change — what every COUNT shown to a
 * teacher is made of. An essay is marked by a human and a hand-set mark is the
 * teacher's own decision; a regrade leaves both exactly where they are, so
 * counting them made «N إجابة اتصححت على نسخة قديمة» a banner no button could
 * ever clear (on 2026-10-17 one exam kept 875 of them after its regrade).
 *
 * This is only the part SQL can settle. The third answer a regrade leaves
 * alone, one naming an option the new version no longer has, can only be told
 * by mapping it, so the stale counts also pass through `planMove`
 * (`movableStale`).
 */
const ACTIONABLE = {
  gradedBy: null,
  version: { type: { not: 'essay' as const } },
};

function carriesAcross(from: QuestionType, to: QuestionType): boolean {
  if (from === 'essay' || to === 'essay') return false;
  return from === to || (CHOICE_TYPES.has(from) && CHOICE_TYPES.has(to));
}

interface StaleAnswer {
  gradedBy: string | null;
  response: Prisma.JsonValue;
  version: { type: QuestionType; options: readonly MappableOption[] };
}

/**
 * Where a regrade would carry this answer on `latest`, or null when it stays
 * as it is: the three rules of «What never moves», in one place. `regradePaper`
 * acts on it and the counts filter by it, because a count that includes an
 * answer the button skips is a banner that never clears. On 2026-10-18 a
 * question rewritten into a different one left 141 + 76 such answers on one
 * exam, all correctly marked against the question their students were shown.
 */
function planMove(
  question: StaleAnswer,
  latest: { type: QuestionType; options: readonly MappableOption[] },
): { mapping: Map<string, string>; response: unknown } | null {
  if (question.gradedBy !== null || !carriesAcross(question.version.type, latest.type)) return null;
  const mapping = mapOptionsBetweenVersions(question.version.options, latest.options);
  const response = question.response === null ? null : remapResponse(question.response, mapping);
  if (question.response !== null && response === null) return null;
  return { mapping, response };
}

@Injectable()
export class RegradeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attempts: AttemptService,
    private readonly progress: LessonProgressService,
    private readonly bank: QuestionBankService,
    private readonly audit: AuditService,
  ) {}

  private latestReady(bankEntryId: string): Promise<FullVersion | null> {
    return this.prisma.questionVersion.findFirst({
      where: { bankEntryId, status: 'ready' },
      orderBy: { version: 'desc' },
      select: VERSION_SELECT,
    });
  }

  private async assertEntry(bankEntryId: string): Promise<void> {
    const entry = await this.prisma.questionBankEntry.findUnique({ where: { id: bankEntryId }, select: { id: true } });
    if (!entry) throw new NotFoundException();
  }

  /**
   * `scope: 'stale'` — answers on a version older than the one served now:
   * what a regrade would move right this moment.
   *
   * `scope: 'all'` — every answer to the question, whatever version. That is
   * what the save confirmation must count: it is asked BEFORE the edit is
   * published, when the answers about to go stale are still on the current
   * version and 'stale' would report zero — and hide the very option the
   * teacher fixing a key needs.
   */
  async preview(bankEntryId: string, scope: 'stale' | 'all' = 'stale'): Promise<RegradePreview> {
    await this.assertEntry(bankEntryId);
    const latest = await this.latestReady(bankEntryId);
    if (!latest && scope === 'stale') {
      return { bankEntryId, version: null, answers: 0, finished: 0, inProgress: 0, students: 0 };
    }

    const where = {
      ...ACTIONABLE,
      version: { bankEntryId, ...ACTIONABLE.version },
      attempt: { state: { in: [...MOVABLE_STATES] } },
    };
    // 'all' is asked before the edit exists: there is no version to map onto yet.
    const papers =
      scope === 'stale' && latest
        ? await this.movableStale({ ...where, questionVersionId: { not: latest.id } })
        : (await this.prisma.attemptQuestion.findMany({ where, select: { attempt: { select: { state: true, userId: true } } } }))
            .map((row) => row.attempt);
    const finished = papers.filter((paper) => FINISHED_STATES.has(paper.state)).length;
    return {
      bankEntryId,
      version: latest?.version ?? null,
      answers: papers.length,
      finished,
      inProgress: papers.length - finished,
      students: new Set(papers.map((paper) => paper.userId)).size,
    };
  }

  /**
   * Of the answers `where` finds, the ones a regrade would really move, each
   * as its paper's state and student: `planMove` against the latest published
   * version, the same test `regradePaper` applies, so the count is exactly what
   * the button would change.
   */
  private async movableStale(
    where: Prisma.AttemptQuestionWhereInput,
  ): Promise<{ state: AttemptState; userId: string }[]> {
    const rows = await this.prisma.attemptQuestion.findMany({
      where,
      select: {
        gradedBy: true,
        response: true,
        version: { select: { bankEntryId: true, type: true, options: { select: { id: true, bodyHtml: true, position: true } } } },
        attempt: { select: { state: true, userId: true } },
      },
    });
    if (rows.length === 0) return [];
    const latest = await this.prisma.questionVersion.findMany({
      where: { bankEntryId: { in: [...new Set(rows.map((row) => row.version.bankEntryId))] }, status: 'ready' },
      orderBy: { version: 'desc' },
      distinct: ['bankEntryId'],
      select: { bankEntryId: true, type: true, options: { select: { id: true, bodyHtml: true, position: true } } },
    });
    const latestByEntry = new Map(latest.map((version) => [version.bankEntryId, version]));
    return rows
      .filter((row) => {
        const target = latestByEntry.get(row.version.bankEntryId);
        return target !== undefined && planMove(row, target) !== null;
      })
      .map((row) => row.attempt);
  }

  async regradeEntry(bankEntryId: string, actorId: string): Promise<RegradeResult> {
    await this.assertEntry(bankEntryId);
    const latest = await this.latestReady(bankEntryId);
    if (!latest) return { ...EMPTY_REGRADE_RESULT };

    const targets = await this.prisma.attemptQuestion.findMany({
      where: {
        version: { bankEntryId },
        questionVersionId: { not: latest.id },
        attempt: { state: { in: [...MOVABLE_STATES] } },
      },
      select: { attemptId: true },
      distinct: ['attemptId'],
    });

    let result: RegradeResult = { ...EMPTY_REGRADE_RESULT };
    for (const { attemptId } of targets) {
      result = addRegradeResults(result, await this.regradePaper(attemptId, bankEntryId, latest, actorId));
    }

    if (result.moved > 0 || result.skipped > 0) {
      await this.audit.record({
        action: 'question:regrade',
        resourceType: AUDIT_RESOURCES.questionBankEntry,
        resourceId: bankEntryId,
        outcome: 'success',
        actorUserId: actorId,
        metadata: { version: latest.version, ...result },
      });
    }
    return result;
  }

  /** One paper, one transaction — see «Locking» above. */
  private regradePaper(
    attemptId: string,
    bankEntryId: string,
    latest: FullVersion,
    actorId: string,
  ): Promise<RegradeResult> {
    return this.prisma.$transaction(async (tx) => {
      // The paper row first, exactly as `saveAnswers` and `submit` take it.
      const locked = await tx.$queryRaw<{ state: AttemptState }[]>`
        SELECT "state" FROM "app"."quiz_attempts" WHERE "id" = ${attemptId}::uuid FOR UPDATE
      `;
      const state = locked[0]?.state;
      if (!state || !MOVABLE_STATES.includes(state)) return { ...EMPTY_REGRADE_RESULT };
      const finished = FINISHED_STATES.has(state);

      // Re-read inside the lock: what was on an old version a moment ago may
      // have been moved by a regrade that ran in between.
      const questions = await tx.attemptQuestion.findMany({
        where: { attemptId, version: { bankEntryId }, questionVersionId: { not: latest.id } },
        select: {
          id: true,
          slotPosition: true,
          optionOrder: true,
          response: true,
          maxMark: true,
          maxFraction: true,
          mark: true,
          gradedAt: true,
          gradedBy: true,
          version: { select: { type: true, options: { select: { id: true, bodyHtml: true, position: true } } } },
        },
      });

      const tally: RegradeResult = { ...EMPTY_REGRADE_RESULT };
      const minFraction = Math.min(0, ...latest.options.map((option) => Number(option.fraction)));

      for (const question of questions) {
        const plan = planMove(question, latest);
        if (!plan) {
          tally.skipped += 1;
          continue;
        }
        const { mapping, response } = plan;

        await tx.attemptQuestion.update({
          where: { id: question.id },
          data: {
            questionVersionId: latest.id,
            optionOrder: remapOptionOrder(question.optionOrder, question.version.options, latest.options, mapping),
            minFraction,
            ...(question.response === null ? {} : { response: response as Prisma.InputJsonValue }),
          },
        });
        tally.moved += 1;

        // A paper still being sat is marked at submit — against this version now.
        if (!finished || question.gradedAt === null) continue;

        const graded = await this.attempts.gradeAndStoreQuestion(
          tx,
          attemptId,
          {
            id: question.id,
            slotPosition: question.slotPosition,
            response,
            maxMark: question.maxMark,
            minFraction,
            maxFraction: question.maxFraction,
            version: { type: latest.type, settings: latest.settings, options: latest.options },
          },
          'regraded',
          actorId,
        );
        tally.regraded += 1;
        const before = question.mark === null ? null : Number(question.mark);
        const after =
          graded.fraction === null
            ? null
            : roundMark(clamp(graded.fraction, graded.minFraction, graded.maxFraction) * graded.maxMark);
        if (before !== null && after !== null && after > before) tally.raised += 1;
        else if (before !== null && after !== null && after < before) tally.lowered += 1;
      }

      if (tally.regraded > 0) {
        const recomputed = await this.attempts.recomputeScoreTx(tx, attemptId);
        tally.attempts = 1;
        // Same progress write `gradeAndFinalise` makes at submit. It keeps the
        // better of old and new (`recordQuizResultTx`), so a correction can
        // unlock a lesson a wrong key had held shut, and can never re-lock one.
        const enrollment = await tx.enrollment.findFirst({
          where: { userId: recomputed.userId, courseId: recomputed.courseId },
          select: { id: true },
        });
        if (enrollment) {
          await this.progress.recordQuizResultTx(tx, {
            enrollmentId: enrollment.id,
            lessonId: recomputed.lessonId,
            courseId: recomputed.courseId,
            passed: recomputed.passed,
            scaledScore: recomputed.scaledScore / (recomputed.gradeOutOf || 1),
            gradeOutOf: recomputed.gradeOutOf,
          });
        }
      }
      return tally;
    });
  }

  /** The exam's bank questions, both papers, fixed slots only (a pool is not one question). */
  private async quizEntryIds(quizId: string): Promise<string[]> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: { slots: { where: { bankEntryId: { not: null } }, select: { bankEntryId: true } } },
    });
    if (!quiz) throw new NotFoundException();
    return [...new Set(quiz.slots.map((slot) => slot.bankEntryId!))];
  }

  /**
   * What «انشر التعديلات» on an exam would do: how many of its questions have
   * an edit nobody published, and how many answers sit on an older version
   * than the one students are now served.
   */
  async quizEdits(quizId: string): Promise<{ pendingDrafts: number; staleAnswers: number; students: number }> {
    const entryIds = await this.quizEntryIds(quizId);
    if (entryIds.length === 0) return { pendingDrafts: 0, staleAnswers: 0, students: 0 };

    const versions = await this.prisma.questionVersion.findMany({
      where: { bankEntryId: { in: entryIds } },
      select: { id: true, bankEntryId: true, version: true, status: true },
      orderBy: { version: 'desc' },
    });
    const newest = new Map<string, (typeof versions)[number]>();
    const latestReady = new Map<string, string>();
    for (const version of versions) {
      if (!newest.has(version.bankEntryId)) newest.set(version.bankEntryId, version);
      if (version.status === 'ready' && !latestReady.has(version.bankEntryId)) {
        latestReady.set(version.bankEntryId, version.id);
      }
    }
    const pendingDrafts = [...newest.values()].filter((version) => version.status === 'draft').length;

    const readyIds = [...latestReady.values()];
    const stale = await this.movableStale({
      ...ACTIONABLE,
      version: { bankEntryId: { in: [...latestReady.keys()] }, ...ACTIONABLE.version },
      questionVersionId: { notIn: readyIds },
      attempt: { quizId, state: { in: [...MOVABLE_STATES] } },
    });
    return {
      pendingDrafts,
      staleAnswers: stale.length,
      students: new Set(stale.map((paper) => paper.userId)).size,
    };
  }

  /**
   * «انشر التعديلات»: every question of the exam whose newest version is an
   * unpublished draft gets published through `QuestionBankService.publish` —
   * the same validation as the single button, so a broken draft stays a draft
   * and is reported, never half-published.
   */
  async publishQuizEdits(quizId: string): Promise<Omit<PublishQuizEditsResult, 'regrade'>> {
    const entryIds = await this.quizEntryIds(quizId);
    const drafts = await this.prisma.questionVersion.findMany({
      where: { bankEntryId: { in: entryIds } },
      orderBy: { version: 'desc' },
      distinct: ['bankEntryId'],
      select: { id: true, bankEntryId: true, status: true },
    });
    let published = 0;
    const failed: { bankEntryId: string; message: string }[] = [];
    for (const draft of drafts) {
      if (draft.status !== 'draft') continue;
      try {
        if (await this.bank.publish(draft.id)) published += 1;
      } catch (error) {
        failed.push({ bankEntryId: draft.bankEntryId, message: error instanceof Error ? error.message : String(error) });
      }
    }
    return { published, failed };
  }

  /** Every question of the exam, regraded — a no-op for those already current. */
  async regradeQuiz(quizId: string, actorId: string): Promise<RegradeResult> {
    let result: RegradeResult = { ...EMPTY_REGRADE_RESULT };
    for (const bankEntryId of await this.quizEntryIds(quizId)) {
      result = addRegradeResults(result, await this.regradeEntry(bankEntryId, actorId));
    }
    return result;
  }
}
