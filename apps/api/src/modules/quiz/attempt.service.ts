import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import type { QuestionType } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { LessonProgressService } from '../progress/lesson-progress.service';
import { AttemptEventsService } from './attempt-events.service';
import type { FlagDto, SaveAnswersDto, SubmitDto } from './dto/save-answers.dto';
import { RIGHT_THRESHOLD, clamp, gradeAttempt, gradeQuestion, roundMark } from './grading';
import type { GradedQuestionRow, QuestionResponse } from './grading';
import { QuizAccessService, type QuizForAttempt } from './quiz-access.service';
import {
  LEARNER_QUESTION_SELECT,
  toLearnerQuestion,
  type LearnerQuestion,
} from './serializers/learner.serializer';

export interface SaveResult {
  savedSlots: number[];
  serverTime: string;
  deadlineAt: string | null;
  answeredCount: number;
}

export interface AttemptResult {
  attemptId: string;
  rawScore: number;
  scaledScore: number;
  passed: boolean;
  needsGrading: boolean;
  attemptState: 'submitted' | 'pending_review';
}

interface DescribableOption {
  id: string;
  bodyHtml: string;
  answerPattern: string | null;
  fraction: number;
}

/** Never HTML — this is what the review screen renders as plain text. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

/**
 * Renders the model answer as text: for choice types, the bodies of every
 * option with `fraction > RIGHT_THRESHOLD`; for short_answer, the first
 * full-credit pattern; for essay, `null` — there is no single "right answer"
 * for prose. Written at SUBMIT time only (see `gradeAndFinalise`), which is
 * the entire reason it cannot leak during the attempt.
 */
function describeRightAnswer(type: QuestionType, options: DescribableOption[]): string | null {
  if (type === 'essay') return null;
  const correct = options.filter((option) => option.fraction > RIGHT_THRESHOLD);
  if (correct.length === 0) return null;
  if (type === 'short_answer') return correct[0]!.answerPattern ?? null;
  return correct.map((option) => stripHtml(option.bodyHtml)).join('، ');
}

/** Renders the STUDENT'S response as text, for the same reason. */
function describeResponse(
  options: DescribableOption[],
  response: QuestionResponse | null,
): string | null {
  if (!response) return null;
  if (response.kind === 'text') return response.text;
  const chosen = options.filter((option) => response.optionIds.includes(option.id));
  if (chosen.length === 0) return null;
  return chosen.map((option) => stripHtml(option.bodyHtml)).join('، ');
}

export interface StartedAttempt {
  attemptId: string;
  attemptToken: string;
  /** ISO string. Persisted at start; never recomputed. */
  deadlineAt: string | null;
  /** The client counts down against THIS, never against its own clock. */
  serverTime: string;
  status: 'in_progress';
  navMethod: 'free' | 'sequential';
  mode: 'practice' | 'graded';
  gradeOutOf: number;
  sumMarks: number;
  questions: LearnerQuestion[];
}

interface ResolvedSlot {
  versionId: string;
  maxMark: number;
  optionPositions: number[];
  minFraction: number;
}

interface PoolSourceFilter {
  categoryIds?: string[];
  types?: QuestionType[];
}

/** Fisher–Yates. `randomInt` (node:crypto) is a CSPRNG source, never Math.random —
 *  a predictable option order plus a leaked seed is a needless extra affordance. */
function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

@Injectable()
export class AttemptService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly access: QuizAccessService,
    protected readonly events: AttemptEventsService,
    protected readonly progress: LessonProgressService,
  ) {}

  async start(userId: string, quizId: string): Promise<StartedAttempt> {
    const quiz = await this.access.assertCanAttempt(userId, quizId);

    const attemptId = await this.prisma.$transaction(async (tx) => {
      // Serialise concurrent starts for THIS (quiz, user) pair only. Without
      // it, two tabs racing produce two attempts and the unique constraint
      // turns one of them into a 500 instead of a resume.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${quizId}:${userId}`}, 0))`;

      const existing = await tx.quizAttempt.findFirst({
        where: { quizId, userId, state: { in: ['in_progress', 'overdue'] } },
        select: { id: true },
      });
      if (existing) return existing.id;

      const previous = await tx.quizAttempt.findMany({
        where: { quizId, userId },
        select: { attemptNo: true, extraAttempts: true, submittedAt: true },
        orderBy: { attemptNo: 'desc' },
      });

      // 0 = unlimited. Otherwise the allowance is the configured limit plus
      // every admin grant recorded on this student's previous attempts.
      const granted = previous.reduce((sum, attempt) => sum + attempt.extraAttempts, 0);
      if (quiz.maxAttempts > 0 && previous.length >= quiz.maxAttempts + granted) {
        throw new ForbiddenException({ code: 'no_attempts_left' });
      }

      if (quiz.retryCooldownHours > 0) {
        const lastSubmitted = previous
          .map((attempt) => attempt.submittedAt)
          .filter((value): value is Date => value !== null)
          .sort((a, b) => b.getTime() - a.getTime())[0];
        if (lastSubmitted) {
          const availableAt = new Date(
            lastSubmitted.getTime() + quiz.retryCooldownHours * 3600 * 1000,
          );
          if (new Date() < availableAt) {
            throw new ForbiddenException({
              code: 'retry_cooldown',
              message: `retry cooldown has not elapsed yet`,
              availableAt,
            });
          }
        }
      }

      const slots = await this.resolveSlots(tx, quiz);
      const startedAt = new Date();

      // Q3: computed ONCE, here, and clamped to the close time if the window
      // ends before the timer would. Nothing recomputes this value, ever.
      let deadlineAt: Date | null = quiz.durationSeconds
        ? new Date(startedAt.getTime() + quiz.durationSeconds * 1000)
        : null;
      if (quiz.openUntil && (deadlineAt === null || quiz.openUntil < deadlineAt)) {
        deadlineAt = quiz.openUntil;
      }

      const attempt = await tx.quizAttempt.create({
        data: {
          quizId,
          userId,
          attemptNo: (previous[0]?.attemptNo ?? 0) + 1,
          state: 'in_progress',
          startedAt,
          deadlineAt,
          lastActivityAt: startedAt,
          attemptToken: randomUUID(),
          questions: {
            create: slots.map((slot, index) => ({
              slotPosition: index,
              // Q2: BOTH snapshots, written at creation and never re-derived.
              questionVersionId: slot.versionId,
              optionOrder: quiz.shuffleOptions
                ? shuffle(slot.optionPositions)
                : slot.optionPositions,
              maxMark: slot.maxMark,
              minFraction: slot.minFraction,
              maxFraction: 1,
              state: 'todo',
            })),
          },
        },
        select: { id: true },
      });

      await this.events.append(tx, {
        attemptId: attempt.id,
        kind: 'attempt_started',
        actorId: userId,
        payload: { questionCount: slots.length, deadlineAt: deadlineAt?.toISOString() ?? null },
      });

      return attempt.id;
    });

    return this.load(userId, attemptId, quiz, { rotateToken: false });
  }

  /**
   * Rotating the token here is what makes it kill a stale tab: a student who
   * reopens the attempt on a second device invalidates the first device's
   * token, so a late autosave from the abandoned tab is rejected rather than
   * overwriting newer answers.
   */
  async resume(userId: string, attemptId: string): Promise<StartedAttempt> {
    const attempt = await this.prisma.quizAttempt.findFirst({
      where: { id: attemptId, userId },
      select: { quizId: true },
    });
    if (!attempt) throw new NotFoundException();
    const quiz = await this.access.assertCanAttempt(userId, attempt.quizId);
    return this.load(userId, attemptId, quiz, { rotateToken: true });
  }

  protected async load(
    userId: string,
    attemptId: string,
    quiz: QuizForAttempt,
    options: { rotateToken: boolean },
  ): Promise<StartedAttempt> {
    if (options.rotateToken) {
      await this.prisma.quizAttempt.updateMany({
        where: { id: attemptId, userId, submittedAt: null },
        data: { attemptToken: randomUUID(), lastActivityAt: new Date() },
      });
    }

    const attempt = await this.prisma.quizAttempt.findFirstOrThrow({
      where: { id: attemptId, userId },
      select: {
        attemptToken: true,
        deadlineAt: true,
        questions: {
          orderBy: { slotPosition: 'asc' },
          select: {
            slotPosition: true,
            maxMark: true,
            optionOrder: true,
            response: true,
            flagged: true,
            state: true,
            // LAYER 1: the answer columns are simply not selected.
            version: { select: LEARNER_QUESTION_SELECT },
          },
        },
      },
    });

    return {
      attemptId,
      attemptToken: attempt.attemptToken,
      deadlineAt: attempt.deadlineAt?.toISOString() ?? null,
      serverTime: new Date().toISOString(),
      status: 'in_progress',
      navMethod: quiz.navMethod,
      mode: quiz.mode,
      gradeOutOf: quiz.gradeOutOf,
      sumMarks: quiz.sumMarks,
      questions: attempt.questions.map((row) => toLearnerQuestion(row.version, row)),
    };
  }

  async saveAnswers(userId: string, attemptId: string, dto: SaveAnswersDto): Promise<SaveResult> {
    // Ownership, token and submission state are checked FIRST, OUTSIDE any
    // transaction that might later abort. A rejection still has to leave an
    // audit trail — appending the `stale_write_rejected` event and then
    // throwing from inside the same `$transaction` callback rolls the whole
    // transaction (including that very event) back, which would silently
    // erase the one record of the stale tab this event exists to prove.
    const attempt = await this.prisma.quizAttempt.findFirst({
      where: {
        id: attemptId,
        userId,
        attemptToken: dto.attemptToken,
        submittedAt: null,
        state: { in: ['in_progress', 'overdue'] },
      },
      select: {
        id: true,
        deadlineAt: true,
        extraTimeSeconds: true,
        quiz: { select: { graceSeconds: true } },
      },
    });

    if (!attempt) {
      // Distinguish "not yours" (404, no information) from "stale/submitted"
      // (409, actionable) — but only after confirming ownership separately,
      // so the 409 never confirms an attempt id the caller does not own.
      const owned = await this.prisma.quizAttempt.count({ where: { id: attemptId, userId } });
      if (owned === 0) throw new NotFoundException();
      await this.events.append(this.prisma, {
        attemptId,
        kind: 'stale_write_rejected',
        actorId: userId,
        payload: {
          reason: 'token_or_submitted',
          seq: dto.seq,
          tokenPrefix: dto.attemptToken.slice(0, 8),
        },
      });
      throw new ConflictException({ code: 'attempt_stale' });
    }

    if (attempt.deadlineAt) {
      const hardStop =
        attempt.deadlineAt.getTime() +
        attempt.extraTimeSeconds * 1000 +
        attempt.quiz.graceSeconds * 1000;
      if (Date.now() > hardStop) {
        throw new ConflictException({ code: 'attempt_overdue', message: 'attempt is overdue' });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const slots = await tx.attemptQuestion.findMany({
        where: { attemptId },
        select: { id: true, slotPosition: true },
      });
      const bySlot = new Map(slots.map((slot) => [slot.slotPosition, slot.id]));

      const saved: number[] = [];
      for (const answer of dto.answers) {
        const questionId = bySlot.get(answer.slotPosition);
        if (!questionId) throw new BadRequestException({ code: 'unknown_slot' });

        // The seq guard AND a re-check of token/submission are both in the
        // WHERE clause, so a stale tab or a resume/submit racing between the
        // pre-check above and this statement still updates zero rows instead
        // of overwriting a newer answer.
        const updated = await tx.attemptQuestion.updateMany({
          where: {
            id: questionId,
            responseSeq: { lt: dto.seq },
            attempt: { attemptToken: dto.attemptToken, submittedAt: null },
          },
          data: {
            response: answer.response ?? Prisma.DbNull,
            responseSeq: dto.seq,
            state: answer.response ? 'complete' : 'todo',
            answeredAt: answer.response ? new Date() : null,
          },
        });
        if (updated.count === 0) continue;

        saved.push(answer.slotPosition);
        await this.events.append(tx, {
          attemptId,
          attemptQuestionId: questionId,
          kind: answer.response ? 'answer_saved' : 'answer_cleared',
          actorId: userId,
          // The response only. No grade is computed here, so none can leak.
          payload: { slotPosition: answer.slotPosition, response: answer.response, seq: dto.seq },
        });
      }

      await tx.quizAttempt.update({
        where: { id: attemptId },
        data: { lastActivityAt: new Date() },
      });

      const answeredCount = await tx.attemptQuestion.count({
        where: { attemptId, state: { not: 'todo' } },
      });

      return {
        savedSlots: saved,
        answeredCount,
        serverTime: new Date().toISOString(),
        deadlineAt: attempt.deadlineAt?.toISOString() ?? null,
      };
    });
  }

  async setFlag(
    userId: string,
    attemptId: string,
    dto: FlagDto,
  ): Promise<{ flagged: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const attempts = await tx.quizAttempt.findMany({
        where: {
          id: attemptId,
          userId,
          attemptToken: dto.attemptToken,
          submittedAt: null,
          state: { in: ['in_progress', 'overdue'] },
        },
        select: { id: true },
      });
      if (!attempts[0]) {
        const owned = await tx.quizAttempt.count({ where: { id: attemptId, userId } });
        if (owned === 0) throw new NotFoundException();
        throw new ConflictException({ code: 'attempt_stale' });
      }

      const question = await tx.attemptQuestion.findFirst({
        where: { attemptId, slotPosition: dto.slotPosition },
        select: { id: true },
      });
      if (!question) throw new BadRequestException({ code: 'unknown_slot' });

      await tx.attemptQuestion.update({
        where: { id: question.id },
        data: { flagged: dto.flagged },
      });

      await this.events.append(tx, {
        attemptId,
        attemptQuestionId: question.id,
        kind: 'flag_toggled',
        actorId: userId,
        payload: { slotPosition: dto.slotPosition, flagged: dto.flagged },
      });

      return { flagged: dto.flagged };
    });
  }

  async submit(userId: string, attemptId: string, dto: SubmitDto): Promise<AttemptResult> {
    return this.prisma.$transaction(async (tx) => {
      // Q4, atomically: the state transition IS the lock. A second submitter
      // updates zero rows and gets a 409; there is no read-then-write window
      // where two concurrent submits could both observe "not yet submitted".
      const claimed = await tx.quizAttempt.updateMany({
        where: {
          id: attemptId,
          userId,
          attemptToken: dto.attemptToken,
          submittedAt: null,
          state: { in: ['in_progress', 'overdue'] },
        },
        data: { submittedAt: new Date(), lastActivityAt: new Date() },
      });
      if (claimed.count === 0) {
        const owned = await tx.quizAttempt.count({ where: { id: attemptId, userId } });
        if (owned === 0) throw new NotFoundException();
        throw new ConflictException({ code: 'attempt_already_submitted' });
      }

      return this.gradeAndFinalise(tx, attemptId, { auto: false, actorId: userId });
    });
  }

  /** Server-computed unanswered count — the submit-confirmation guard reads
   *  THIS, never a client-supplied count, so "you have 3 unanswered
   *  questions" cannot be spoofed into "0" by a hostile client. */
  async preflight(
    userId: string,
    attemptId: string,
  ): Promise<{ unansweredCount: number; total: number }> {
    const owned = await this.prisma.quizAttempt.count({ where: { id: attemptId, userId } });
    if (owned === 0) throw new NotFoundException();

    const [total, answered] = await Promise.all([
      this.prisma.attemptQuestion.count({ where: { attemptId } }),
      this.prisma.attemptQuestion.count({ where: { attemptId, state: { not: 'todo' } } }),
    ]);
    return { unansweredCount: total - answered, total };
  }

  /**
   * RECONCILED — required by Plan 6 Task 11 and by Task 19's appeal regrade.
   * Recomputes the attempt score from the CURRENT `attempt_questions`
   * fractions (never from a client value, never patched directly), persists
   * it, appends an `attempt_events` row, and returns the new 0..1 score.
   */
  async recomputeScore(attemptId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.quizAttempt.findUniqueOrThrow({
        where: { id: attemptId },
        select: {
          quiz: { select: { sumMarks: true, gradeOutOf: true, passPercent: true } },
          questions: {
            select: { fraction: true, maxMark: true, minFraction: true, maxFraction: true, state: true },
          },
        },
      });

      const graded: GradedQuestionRow[] = attempt.questions.map((question) => ({
        fraction: question.fraction === null ? null : Number(question.fraction),
        maxMark: Number(question.maxMark),
        minFraction: Number(question.minFraction),
        maxFraction: Number(question.maxFraction),
        state: question.state,
      }));

      const summary = gradeAttempt(graded, {
        sumMarks: Number(attempt.quiz.sumMarks),
        gradeOutOf: Number(attempt.quiz.gradeOutOf),
        passPercent: Number(attempt.quiz.passPercent),
      });

      await tx.quizAttempt.update({
        where: { id: attemptId },
        data: {
          state: summary.attemptState,
          rawScore: summary.rawScore,
          scaledScore: summary.scaledScore,
          passed: summary.passed,
        },
      });

      await this.events.append(tx, {
        attemptId,
        kind: 'regraded',
        payload: { rawScore: summary.rawScore, scaledScore: summary.scaledScore, passed: summary.passed },
      });

      return summary.scaledScore;
    });
  }

  /**
   * RECONCILED — required by Plan 6 Task 11's unlock action and by Task 20.
   * Issues a fresh `attemptToken`, which invalidates any stale tab still
   * holding the old one, and returns it. Every write path already compiles
   * the token into its UPDATE's WHERE clause, so a stale tab's next save is a
   * 409 rather than a clobber.
   */
  async reissueToken(attemptId: string): Promise<string> {
    const token = randomUUID();
    await this.prisma.quizAttempt.update({
      where: { id: attemptId },
      data: { attemptToken: token },
    });
    return token;
  }

  /**
   * Called only by `OverdueService.sweep()` — server-initiated, no caller to
   * own or spoof a token for. Claims the attempt with the same conditional
   * `updateMany` shape as `submit()` (minus the token, since this IS the
   * server acting), then either grades what is there or abandons it.
   */
  async closeOverdue(attemptId: string): Promise<'submitted' | 'pending_review' | 'abandoned' | null> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.quizAttempt.findFirst({
        where: { id: attemptId, state: { in: ['in_progress', 'overdue'] }, submittedAt: null },
        select: { quiz: { select: { overdueHandling: true } } },
      });
      if (!attempt) return null;

      if (attempt.quiz.overdueHandling === 'autoabandon') {
        await tx.quizAttempt.update({
          where: { id: attemptId },
          data: { state: 'abandoned', submittedAt: new Date(), lastActivityAt: new Date() },
        });
        await this.events.append(tx, { attemptId, kind: 'abandoned', payload: {} });
        return 'abandoned';
      }

      await tx.quizAttempt.update({
        where: { id: attemptId },
        data: { submittedAt: new Date(), lastActivityAt: new Date() },
      });
      const result = await this.gradeAndFinalise(tx, attemptId, { auto: true, actorId: null });
      return result.attemptState;
    });
  }

  /**
   * Shared by submit() and the overdue sweeper. Every value it grades comes
   * from a fresh read of question_versions and question_options through the
   * SNAPSHOTTED version id — never from the request, never from a cache.
   */
  private async gradeAndFinalise(
    tx: Prisma.TransactionClient,
    attemptId: string,
    context: { auto: boolean; actorId: string | null },
  ): Promise<AttemptResult> {
    const attempt = await tx.quizAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      select: {
        id: true,
        userId: true,
        quiz: {
          select: {
            id: true,
            lessonId: true,
            sumMarks: true,
            gradeOutOf: true,
            passPercent: true,
            mode: true,
          },
        },
        questions: {
          orderBy: { slotPosition: 'asc' },
          select: {
            id: true,
            slotPosition: true,
            response: true,
            maxMark: true,
            minFraction: true,
            maxFraction: true,
            version: {
              select: {
                id: true,
                type: true,
                settings: true,
                generalFeedbackHtml: true,
                // The FULL option row — this is a grading read, after
                // submission, and it is never serialized to the learner
                // except through the review serializer's flag matrix.
                options: {
                  orderBy: { position: 'asc' },
                  select: {
                    id: true,
                    fraction: true,
                    position: true,
                    bodyHtml: true,
                    answerPattern: true,
                    feedbackHtml: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const graded: GradedQuestionRow[] = [];

    for (const question of attempt.questions) {
      const settings = (question.version.settings ?? {}) as { caseSensitive?: boolean };
      const optionRows = question.version.options.map((option) => ({
        id: option.id,
        bodyHtml: option.bodyHtml,
        answerPattern: option.answerPattern,
        fraction: Number(option.fraction),
        position: option.position,
      }));

      const result = gradeQuestion(
        {
          type: question.version.type,
          caseSensitive: settings.caseSensitive === true,
          options: optionRows,
        },
        (question.response ?? null) as QuestionResponse | null,
      );

      const maxMark = Number(question.maxMark);
      const mark =
        result.fraction === null
          ? null
          : roundMark(
              clamp(result.fraction, Number(question.minFraction), Number(question.maxFraction)) *
                maxMark,
            );

      await tx.attemptQuestion.update({
        where: { id: question.id },
        data: {
          fraction: result.fraction,
          mark,
          state: result.state,
          gradedAt: new Date(),
          // Written HERE, after submission, and nowhere earlier — which is why
          // the model answer cannot leak during the attempt.
          rightAnswerText: describeRightAnswer(question.version.type, optionRows),
          responseText: describeResponse(optionRows, (question.response ?? null) as QuestionResponse | null),
          feedbackHtml:
            result.matchedOptionIds
              .map((id) => question.version.options.find((option) => option.id === id)?.feedbackHtml)
              .filter((value): value is string => Boolean(value))
              .join('') || null,
        },
      });

      await this.events.append(tx, {
        attemptId,
        attemptQuestionId: question.id,
        kind: 'graded',
        actorId: context.actorId,
        payload: { slotPosition: question.slotPosition, fraction: result.fraction, mark },
      });

      graded.push({
        fraction: result.fraction,
        maxMark,
        minFraction: Number(question.minFraction),
        maxFraction: Number(question.maxFraction),
        state: result.state,
      });
    }

    const summary = gradeAttempt(graded, {
      sumMarks: Number(attempt.quiz.sumMarks),
      gradeOutOf: Number(attempt.quiz.gradeOutOf),
      passPercent: Number(attempt.quiz.passPercent),
    });

    await tx.quizAttempt.update({
      where: { id: attemptId },
      data: {
        state: summary.attemptState,
        rawScore: summary.rawScore,
        scaledScore: summary.scaledScore,
        passed: summary.passed,
      },
    });

    await this.events.append(tx, {
      attemptId,
      kind: context.auto ? 'autosubmitted' : 'submitted',
      actorId: context.actorId,
      payload: { rawScore: summary.rawScore, scaledScore: summary.scaledScore, passed: summary.passed },
    });

    await this.progress.recordQuizResult({
      userId: attempt.userId,
      lessonId: attempt.quiz.lessonId,
      passed: summary.passed,
      scaledScore: summary.scaledScore / (Number(attempt.quiz.gradeOutOf) || 1),
      gradeOutOf: Number(attempt.quiz.gradeOutOf),
    });

    return { attemptId, ...summary };
  }

  /** Fixed slots resolve to their pinned or latest-ready version; pools draw. */
  private async resolveSlots(
    tx: Prisma.TransactionClient,
    quiz: QuizForAttempt,
  ): Promise<ResolvedSlot[]> {
    const slots = await tx.quizSlot.findMany({
      where: { quizId: quiz.id },
      orderBy: { position: 'asc' },
      select: {
        bankEntryId: true,
        pinnedVersion: true,
        poolId: true,
        maxMark: true,
        pool: { select: { pickCount: true, sourceFilter: true, pointsPerQuestion: true } },
      },
    });

    const resolved: ResolvedSlot[] = [];
    const optionSelect = {
      orderBy: { position: 'asc' as const },
      select: { position: true, fraction: true },
    };

    for (const slot of slots) {
      if (slot.bankEntryId) {
        const version = slot.pinnedVersion
          ? await tx.questionVersion.findFirst({
              where: { bankEntryId: slot.bankEntryId, version: slot.pinnedVersion },
              select: { id: true, options: optionSelect },
            })
          : await tx.questionVersion.findFirst({
              where: { bankEntryId: slot.bankEntryId, status: 'ready' },
              orderBy: { version: 'desc' },
              select: { id: true, options: optionSelect },
            });
        // A slot whose question has no ready version at all is a publish-time
        // bug (Task 15's preflight is what should have caught it) — skipping
        // it here fails a real attempt safe rather than crashing the runner.
        if (!version) continue;

        resolved.push({
          versionId: version.id,
          maxMark: Number(slot.maxMark),
          optionPositions: version.options.map((option) => option.position),
          minFraction: Math.min(0, ...version.options.map((option) => Number(option.fraction))),
        });
        continue;
      }

      if (slot.poolId && slot.pool) {
        const filter = (slot.pool.sourceFilter ?? {}) as PoolSourceFilter;
        const candidates = await tx.questionVersion.findMany({
          where: {
            status: 'ready',
            bankEntry: filter.categoryIds?.length
              ? { categoryId: { in: filter.categoryIds } }
              : undefined,
            type: filter.types?.length ? { in: filter.types } : undefined,
          },
          select: { id: true, options: optionSelect },
        });
        const drawn = shuffle(candidates).slice(0, slot.pool.pickCount);
        for (const version of drawn) {
          resolved.push({
            versionId: version.id,
            maxMark: Number(slot.pool.pointsPerQuestion),
            optionPositions: version.options.map((option) => option.position),
            minFraction: Math.min(0, ...version.options.map((option) => Number(option.fraction))),
          });
        }
      }
    }

    return quiz.shuffleQuestions ? shuffle(resolved) : resolved;
  }
}
