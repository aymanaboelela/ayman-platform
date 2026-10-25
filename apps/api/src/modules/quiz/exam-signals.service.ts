import { Injectable, NotFoundException } from '@nestjs/common';
import { isMonthlyExamLesson } from '@ayman/contracts/quiz/monthly-exam';
import {
  summariseExamSignals,
  type AdminExamSignal,
  type AdminExamSignals,
  type ExamSignalsBody,
  type ExamSignalType,
} from '@ayman/contracts/quiz/exam-signals';
import { IS_AYMAN } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AttemptEventsService } from './attempt-events.service';

/**
 * A ceiling per sitting. A student who alt-tabs every few seconds for two
 * hours has already told the instructor everything at a few hundred rows; the
 * ceiling is what stops a script posting batches in a loop from filling the
 * append-only table, which nothing can trim afterwards.
 */
export const MAX_SIGNALS_PER_ATTEMPT = 1_000;

/**
 * The runner flushes on `pagehide` and on unmount, and the submit button is
 * one of the ways the page goes away. A batch can therefore land a moment
 * AFTER the paper was handed in, and what it carries happened before.
 */
const LATE_BATCH_MS = 2 * 60_000;

/**
 * «في الامتحان لما حد يعمل كوبي بيست… أو طلع برا الصفحة… أبقى عارف» — the
 * server half of the exam runner's quiet record. See
 * `@ayman/contracts/quiz/exam-signals` for what is recorded and why it is
 * evidence and never a verdict.
 */
@Injectable()
export class ExamSignalsService {
  /**
   * Ayman's stack only (CLAUDE.md §3: he asked for it for himself). A field
   * rather than a bare `IS_AYMAN` at each use, so a spec can run both sides
   * without rebooting the process under another `TENANT_KEY`.
   */
  protected enabled = IS_AYMAN;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: AttemptEventsService,
  ) {}

  /**
   * Whether the runner should record on this lesson's paper: a monthly exam
   * (a quiz on the «امتحانات الشهر» shelf) or the course's final exam. Never
   * a lecture's quiz, which is practice, not an exam.
   */
  async watches(lessonId: string): Promise<boolean> {
    if (!this.enabled) return false;
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { kind: true, section: { select: { title: true } }, examOfCourse: { select: { id: true } } },
    });
    if (!lesson) return false;
    return lesson.examOfCourse !== null || isMonthlyExamLesson(lesson.kind, lesson.section.title);
  }

  /**
   * Stores one batch from the runner.
   *
   * Answers `{ recorded: 0 }` rather than an error for everything that is not
   * the caller's fault: a lecture quiz, another teacher's stack, a paper long
   * since closed, a full ledger. The runner is fire-and-forget and must never
   * have a reason to show the student anything.
   *
   * Only "not your attempt" is a 404, with no information, the same answer
   * every other attempt route gives a non-owner.
   */
  async record(userId: string, attemptId: string, body: ExamSignalsBody): Promise<{ recorded: number }> {
    const attempt = await this.prisma.quizAttempt.findFirst({
      where: { id: attemptId, userId },
      select: {
        state: true,
        submittedAt: true,
        quiz: { select: { lessonId: true } },
        questions: { select: { id: true, slotPosition: true } },
      },
    });
    if (!attempt) throw new NotFoundException();

    const open =
      attempt.state === 'in_progress' ||
      attempt.state === 'overdue' ||
      (attempt.submittedAt !== null && Date.now() - attempt.submittedAt.getTime() < LATE_BATCH_MS);
    if (!open || !(await this.watches(attempt.quiz.lessonId))) return { recorded: 0 };

    const bySlot = new Map(attempt.questions.map((question) => [question.slotPosition, question.id]));

    return this.prisma.$transaction(async (tx) => {
      // The attempt row first, the same order submit and the overdue sweep
      // take it in, so a batch landing mid-submit queues behind the submit
      // instead of racing it for the next `seq`.
      await tx.$queryRaw`SELECT 1 FROM "app"."quiz_attempts" WHERE "id" = ${attemptId}::uuid FOR UPDATE`;

      const already = await tx.attemptEvent.count({ where: { attemptId, kind: 'exam_signal' } });
      const accepted = body.signals.slice(0, Math.max(0, MAX_SIGNALS_PER_ATTEMPT - already));

      await this.events.appendMany(tx, {
        attemptId,
        kind: 'exam_signal',
        actorId: userId,
        rows: accepted.map((signal) => ({
          attemptQuestionId: signal.slot === undefined ? null : (bySlot.get(signal.slot) ?? null),
          payload: signal,
        })),
      });
      return { recorded: accepted.length };
    });
  }

  /**
   * The marking screen's panel, or `null` when the runner never recorded on
   * this paper: a lecture quiz, another stack, or an exam sat before this
   * shipped. Every watched sitting has at least its `opened` row, so «nothing
   * here» and «nobody was looking» stay two different answers.
   */
  async forAdmin(attemptId: string): Promise<AdminExamSignals | null> {
    const rows = await this.prisma.attemptEvent.findMany({
      where: { attemptId, kind: 'exam_signal' },
      orderBy: [{ seq: 'asc' }],
      select: { payload: true, createdAt: true },
    });
    if (rows.length === 0) return null;

    const events: AdminExamSignal[] = rows.map((row) => {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      return {
        type: payload.type as ExamSignalType,
        at: typeof payload.at === 'string' ? payload.at : row.createdAt.toISOString(),
        questionNumber: typeof payload.slot === 'number' ? payload.slot + 1 : null,
        chars: typeof payload.chars === 'number' ? payload.chars : null,
        text: typeof payload.text === 'string' ? payload.text : null,
        awayMs: typeof payload.awayMs === 'number' ? payload.awayMs : null,
      };
    });
    return summariseExamSignals(events);
  }
}
