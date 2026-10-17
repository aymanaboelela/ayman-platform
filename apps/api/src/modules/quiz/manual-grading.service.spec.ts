import 'dotenv/config';
import { BadRequestException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AuditService } from '../../audit/audit.service';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CourseProgressService } from '../progress/course-progress.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { LessonProgressService } from '../progress/lesson-progress.service';
import { AttemptEventsService } from './attempt-events.service';
import { AttemptService } from './attempt.service';
import { ManualGradingService } from './manual-grading.service';
import { QuizAccessService } from './quiz-access.service';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

/**
 * The marking screen's write path — the one place a student's RECORDED answer
 * can change after they handed the paper in.
 *
 * Against the real database (the `quiz-fixtures` chain), because what is under
 * test is what lands in `attempt_questions` and `quiz_attempts`: a mocked
 * transaction would happily "store" an answer the real one rejects.
 */
describe('ManualGradingService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const entitlement = new EntitlementService(prisma);
  const lessonAccess = new LessonAccessService(prisma, new LessonGateService(prisma, entitlement), entitlement);
  const notifications = new NotificationsService(prisma);
  const attempts = new AttemptService(
    prisma,
    new QuizAccessService(prisma, lessonAccess),
    new AttemptEventsService(),
    new LessonProgressService(prisma, lessonAccess, new CourseProgressService(notifications), notifications),
    lessonAccess,
    notifications,
  );
  const grading = new ManualGradingService(prisma, new AuditService(prisma), attempts, notifications);

  const fixtures: QuizFixture[] = [];

  /** A sat-and-submitted paper is a few dozen writes on the shared dev
   *  database — the same allowance `attempt.service.spec.ts` gives its own. */
  const SLOW = 30_000;

  afterEach(async () => {
    for (const created of fixtures.splice(0)) await created.cleanup();
  }, SLOW);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * Three single-answer questions and an essay, sat and handed in: question 1
   * left BLANK, questions 2 and 3 answered right, the essay written. So the
   * paper is `pending_review` with one answer nobody has marked.
   */
  async function submittedPaper() {
    const f = await seedQuizFixture(prisma, { questionCount: 3, includeEssay: true, shuffleQuestions: false });
    fixtures.push(f);

    const started = await attempts.start(f.studentId, f.quizId);
    const rows = await prisma.attemptQuestion.findMany({
      where: { attemptId: started.attemptId },
      orderBy: { slotPosition: 'asc' },
      select: {
        id: true,
        slotPosition: true,
        version: { select: { type: true, options: { orderBy: { position: 'asc' }, select: { id: true, fraction: true } } } },
      },
    });
    const right = (slot: number) => rows[slot]!.version.options.find((option) => Number(option.fraction) > 0)!.id;

    await attempts.saveAnswers(f.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
      seq: 1,
      answers: [
        { slotPosition: 1, response: { kind: 'choice', optionIds: [right(1)] } },
        { slotPosition: 2, response: { kind: 'choice', optionIds: [right(2)] } },
        { slotPosition: 3, response: { kind: 'text', text: 'إجابة مقالية' } },
      ],
    });
    await attempts.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });

    return { f, attemptId: started.attemptId, rows, right };
  }

  async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
    try {
      await promise;
    } catch (error) {
      if (error instanceof BadRequestException) return (error.getResponse() as { code?: string }).code;
      throw error;
    }
    return undefined;
  }

  it('marks a blank choice question without inventing an answer for it', async () => {
    // The card used to send `{kind:'choice', optionIds: []}` on every save, so
    // marking a question the student skipped also "answered" it with nothing.
    const { f, attemptId, rows } = await submittedPaper();

    await grading.grade(attemptId, rows[0]!.id, { mark: 1 }, f.adminId);

    const stored = await prisma.attemptQuestion.findUniqueOrThrow({
      where: { id: rows[0]!.id },
      select: { response: true, responseText: true, mark: true, gradedBy: true },
    });
    expect(stored.response).toBeNull();
    expect(stored.responseText).toBeNull();
    expect(Number(stored.mark)).toBe(1);
    expect(stored.gradedBy).toBe(f.adminId);
  }, SLOW);

  it('stores a corrected answer, with the option’s TEXT as the response text', async () => {
    const { f, attemptId, rows, right } = await submittedPaper();

    await grading.grade(
      attemptId,
      rows[0]!.id,
      { mark: 1, response: { kind: 'choice', optionIds: [right(0)] } },
      f.adminId,
    );

    const stored = await prisma.attemptQuestion.findUniqueOrThrow({
      where: { id: rows[0]!.id },
      select: { response: true, responseText: true },
    });
    expect(stored.response).toEqual({ kind: 'choice', optionIds: [right(0)] });
    // `seedQuizFixture`'s correct option reads «أ (الصحيحة)» — text, not an id.
    expect(stored.responseText).toBe('أ (الصحيحة)');
  }, SLOW);

  it('refuses an option that belongs to a different question, and writes nothing', async () => {
    const { f, attemptId, rows, right } = await submittedPaper();
    const before = await prisma.attemptQuestion.findUniqueOrThrow({
      where: { id: rows[0]!.id },
      select: { mark: true, response: true, gradedAt: true },
    });

    expect(
      await codeOf(
        grading.grade(attemptId, rows[0]!.id, { mark: 1, response: { kind: 'choice', optionIds: [right(1)] } }, f.adminId),
      ),
    ).toBe('response_option_not_in_question');

    const after = await prisma.attemptQuestion.findUniqueOrThrow({
      where: { id: rows[0]!.id },
      select: { mark: true, response: true, gradedAt: true },
    });
    expect(after).toEqual(before);
  }, SLOW);

  it('refuses two answers on a single-answer question', async () => {
    const { f, attemptId, rows } = await submittedPaper();
    const [first, second] = rows[0]!.version.options;

    expect(
      await codeOf(
        grading.grade(
          attemptId,
          rows[0]!.id,
          { mark: 1, response: { kind: 'choice', optionIds: [first!.id, second!.id] } },
          f.adminId,
        ),
      ),
    ).toBe('response_shape_invalid');
  }, SLOW);

  it('refuses to rewrite the answer to an essay', async () => {
    const { f, attemptId, rows } = await submittedPaper();
    const essay = rows[3]!;
    expect(essay.version.type).toBe('essay');

    expect(
      await codeOf(
        grading.grade(attemptId, essay.id, { mark: 1, response: { kind: 'choice', optionIds: ['x'] } }, f.adminId),
      ),
    ).toBe('response_not_editable');
  }, SLOW);

  it('marks the essay, finishes the paper, and records the mark it replaced', async () => {
    const { f, attemptId, rows } = await submittedPaper();

    const { scaledScore } = await grading.grade(attemptId, rows[3]!.id, { mark: 5 }, f.adminId);

    // Clamped to the slot's 1 mark: questions 2, 3 and the essay → 3 of 4 → 75.
    expect(scaledScore).toBe(75);
    const attempt = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: attemptId }, select: { state: true } });
    expect(attempt.state).toBe('submitted');

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { resourceId: attemptId, action: 'attempt:grade' },
      orderBy: { id: 'desc' },
      select: { metadata: true },
    });
    expect(audit.metadata).toMatchObject({ attemptQuestionId: rows[3]!.id, mark: 1, previousMark: null });
  }, SLOW);

  it('overrides the total within the paper’s own scale, and refuses a total above it', async () => {
    const { f, attemptId } = await submittedPaper();

    expect(await codeOf(grading.overrideScore(attemptId, { scaledScore: 120 }, f.adminId))).toBe('score_above_total');

    const result = await grading.overrideScore(attemptId, { scaledScore: 80 }, f.adminId);
    expect(result).toEqual({ scaledScore: 80, passed: true });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { resourceId: attemptId, action: 'attempt:grade' },
      orderBy: { id: 'desc' },
      select: { metadata: true },
    });
    // 2 of 4 answered right with the essay unmarked → 50 before the override.
    expect(audit.metadata).toMatchObject({ overriddenScore: 80, previousScore: 50 });
  }, SLOW);
});
