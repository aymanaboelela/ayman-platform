import 'dotenv/config';
import { NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { CourseProgressService } from '../progress/course-progress.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { LessonProgressService } from '../progress/lesson-progress.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AttemptEventsService } from './attempt-events.service';
import { AttemptService } from './attempt.service';
import { ExamSignalsService } from './exam-signals.service';
import { QuizAccessService } from './quiz-access.service';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

/** Pins the tenant switch either way without rebooting under another
 *  `TENANT_KEY`. */
class TestExamSignalsService extends ExamSignalsService {
  setEnabled(value: boolean): this {
    this.enabled = value;
    return this;
  }
}

describe('ExamSignalsService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const lessonAccess = () =>
    new LessonAccessService(prisma, new LessonGateService(prisma, new EntitlementService(prisma)), new EntitlementService(prisma));
  const events = new AttemptEventsService();
  const signals = new TestExamSignalsService(prisma, events).setEnabled(true);
  const attempts = new AttemptService(
    prisma,
    new QuizAccessService(prisma, lessonAccess()),
    events,
    new LessonProgressService(
      prisma,
      lessonAccess(),
      new CourseProgressService(new NotificationsService(prisma)),
      new NotificationsService(prisma),
    ),
    lessonAccess(),
    new NotificationsService(prisma),
    undefined,
    signals,
  );

  const fixtures: QuizFixture[] = [];
  const SLOW = 30_000;
  const at = () => new Date().toISOString();

  /** A monthly exam: the fixture's quiz lesson, moved onto the shelf. */
  async function monthlyExam(): Promise<QuizFixture> {
    const created = await seedQuizFixture(prisma, { questionCount: 3 });
    fixtures.push(created);
    await prisma.courseSection.updateMany({
      where: { courseId: created.courseId },
      data: { title: EXAM_SHELF_TITLE },
    });
    return created;
  }

  async function lectureQuiz(): Promise<QuizFixture> {
    const created = await seedQuizFixture(prisma, { questionCount: 3 });
    fixtures.push(created);
    return created;
  }

  afterEach(async () => {
    signals.setEnabled(true);
    while (fixtures.length > 0) {
      await fixtures.pop()!.cleanup();
    }
  }, 20_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('records on a monthly exam and tells the runner so', async () => {
    const exam = await monthlyExam();
    const started = await attempts.start(exam.studentId, exam.quizId);
    expect(started.signals).toBe(true);

    const result = await signals.record(exam.studentId, started.attemptId, {
      signals: [
        { type: 'opened', at: at(), slot: 0 },
        { type: 'paste', at: at(), slot: 1, chars: 12, text: 'from a model' },
        { type: 'hidden', at: at(), slot: 1 },
        { type: 'visible', at: at(), slot: 1, awayMs: 40_000 },
      ],
    });
    expect(result).toEqual({ recorded: 4 });

    const rows = await prisma.attemptEvent.findMany({
      where: { attemptId: started.attemptId, kind: 'exam_signal' },
      orderBy: { seq: 'asc' },
      select: { seq: true, attemptQuestionId: true, actorId: true },
    });
    expect(rows).toHaveLength(4);
    // Numbered straight on from the attempt's own `attempt_started` row.
    expect(rows.map((row) => row.seq)).toEqual([2, 3, 4, 5]);
    expect(rows.every((row) => row.attemptQuestionId !== null && row.actorId === exam.studentId)).toBe(true);

    const panel = await signals.forAdmin(started.attemptId);
    expect(panel).toMatchObject({ pastes: 1, leaves: 1, awayMs: 40_000, opens: 1 });
    expect(panel!.events[1]).toMatchObject({ type: 'paste', questionNumber: 2, chars: 12, text: 'from a model' });
  }, SLOW);

  it('records nothing on a lecture quiz, and the runner is told not to send', async () => {
    const quiz = await lectureQuiz();
    const started = await attempts.start(quiz.studentId, quiz.quizId);
    expect(started.signals).toBe(false);

    await expect(
      signals.record(quiz.studentId, started.attemptId, { signals: [{ type: 'paste', at: at() }] }),
    ).resolves.toEqual({ recorded: 0 });
    await expect(signals.forAdmin(started.attemptId)).resolves.toBeNull();
  }, SLOW);

  it('records nothing on another teacher’s stack, even on an exam', async () => {
    const exam = await monthlyExam();
    signals.setEnabled(false);
    const started = await attempts.start(exam.studentId, exam.quizId);
    expect(started.signals).toBe(false);
    await expect(
      signals.record(exam.studentId, started.attemptId, { signals: [{ type: 'paste', at: at() }] }),
    ).resolves.toEqual({ recorded: 0 });
  }, SLOW);

  it('is a 404 for somebody else’s attempt', async () => {
    const exam = await monthlyExam();
    const started = await attempts.start(exam.studentId, exam.quizId);
    await expect(
      signals.record(exam.otherStudentId, started.attemptId, { signals: [{ type: 'paste', at: at() }] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  }, SLOW);

  it('takes a batch that lands just after submit, and nothing once the paper is long closed', async () => {
    const exam = await monthlyExam();
    const started = await attempts.start(exam.studentId, exam.quizId);

    await prisma.quizAttempt.update({
      where: { id: started.attemptId },
      data: { state: 'submitted', submittedAt: new Date() },
    });
    await expect(
      signals.record(exam.studentId, started.attemptId, { signals: [{ type: 'pagehide', at: at() }] }),
    ).resolves.toEqual({ recorded: 1 });

    await prisma.quizAttempt.update({
      where: { id: started.attemptId },
      data: { submittedAt: new Date(Date.now() - 60 * 60_000) },
    });
    await expect(
      signals.record(exam.studentId, started.attemptId, { signals: [{ type: 'paste', at: at() }] }),
    ).resolves.toEqual({ recorded: 0 });
  }, SLOW);
});
