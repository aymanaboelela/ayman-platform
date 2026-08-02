import 'dotenv/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { QuizAccessService } from './quiz-access.service';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

describe('QuizAccessService.assertCanAttempt', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const lessonAccess = new LessonAccessService(prisma, new LessonGateService(prisma));
  const service = new QuizAccessService(prisma, lessonAccess);

  let fixture: QuizFixture;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await fixture?.cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows an enrolled student against a fully published quiz', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await expect(service.assertCanAttempt(fixture.studentId, fixture.quizId)).resolves.toMatchObject(
      { id: fixture.quizId, courseId: fixture.courseId },
    );
  });

  it('denies a student with no enrollment at all, and so does LessonAccessService', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await prisma.enrollment.deleteMany({ where: { userId: fixture.studentId } });

    await expect(service.assertCanAttempt(fixture.studentId, fixture.quizId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // The two predicates must never drift: whatever LessonAccessService denies,
    // this denies too (it is 404-shaped there, 403-shaped here — different
    // status because unlike the lesson player, a quiz id enumeration is not an
    // existence oracle over PUBLISHED content the same way).
    await expect(
      lessonAccess.require(fixture.studentId, fixture.lessonId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('denies when the lesson is unpublished', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await prisma.lesson.update({ where: { id: fixture.lessonId }, data: { isPublished: false } });
    await expect(service.assertCanAttempt(fixture.studentId, fixture.quizId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      lessonAccess.require(fixture.studentId, fixture.lessonId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('denies when the course is not published', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await prisma.course.update({ where: { id: fixture.courseId }, data: { status: 'draft' } });
    await expect(service.assertCanAttempt(fixture.studentId, fixture.quizId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('denies when the quiz itself is unpublished', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await prisma.quiz.update({ where: { id: fixture.quizId }, data: { isPublished: false } });
    await expect(service.assertCanAttempt(fixture.studentId, fixture.quizId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('denies before openFrom with a distinct code', async () => {
    const openFrom = new Date(Date.now() + 3600_000);
    fixture = await seedQuizFixture(prisma, { openFrom });
    await expect(service.assertCanAttempt(fixture.studentId, fixture.quizId)).rejects.toMatchObject({
      response: { code: 'quiz_not_open_yet' },
    });
  });

  it('denies after openUntil with a distinct code', async () => {
    const openUntil = new Date(Date.now() - 1000);
    fixture = await seedQuizFixture(prisma, { openUntil });
    await expect(service.assertCanAttempt(fixture.studentId, fixture.quizId)).rejects.toMatchObject({
      response: { code: 'quiz_closed' },
    });
  });

  it('allows inside an [openFrom, openUntil) window', async () => {
    fixture = await seedQuizFixture(prisma, {
      openFrom: new Date(Date.now() - 3600_000),
      openUntil: new Date(Date.now() + 3600_000),
    });
    await expect(service.assertCanAttempt(fixture.studentId, fixture.quizId)).resolves.toBeDefined();
  });
});

describe('QuizAccessService.getLessonOverview', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const lessonAccess = new LessonAccessService(prisma, new LessonGateService(prisma));
  const service = new QuizAccessService(prisma, lessonAccess);

  let fixture: QuizFixture;

  // B7: sumMarks/gradeOutOf/passPercent are snapshotted onto the attempt at
  // start() now — a direct quizAttempt.create() bypassing that flow supplies
  // them itself, read straight off the fixture's own quiz.
  async function quizSnapshot() {
    return prisma.quiz.findUniqueOrThrow({
      where: { id: fixture.quizId },
      select: { sumMarks: true, gradeOutOf: true, passPercent: true },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await fixture?.cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('404s for a lesson the student is not enrolled in, the same shape as another student\'s attempt', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await expect(
      service.getLessonOverview(fixture.otherStudentId, 'not-a-lesson'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports questionCount, marks and an empty attempt history for a fresh student', async () => {
    fixture = await seedQuizFixture(prisma, { questionCount: 3 });
    const overview = await service.getLessonOverview(fixture.studentId, fixture.lessonId);
    expect(overview.questionCount).toBe(3);
    expect(overview.sumMarks).toBe(3);
    expect(overview.attempts).toEqual([]);
    expect(overview.attemptsUsed).toBe(0);
    expect(overview.blocked).toBeNull();
    expect(overview.inProgressAttemptId).toBeNull();
  });

  it('reports the retry cooldown as blocked, with the exact availableAt', async () => {
    fixture = await seedQuizFixture(prisma, { retryCooldownHours: 24 });
    const submittedAt = new Date();
    await prisma.quizAttempt.create({
      data: {
        quizId: fixture.quizId,
        userId: fixture.studentId,
        attemptNo: 1,
        state: 'submitted',
        submittedAt,
        scaledScore: 40,
        passed: false,
        ...(await quizSnapshot()),
      },
    });
    const overview = await service.getLessonOverview(fixture.studentId, fixture.lessonId);
    expect(overview.blocked?.code).toBe('retry_cooldown');
    expect(overview.attempts).toHaveLength(1);
    expect(overview.attempts[0]).toMatchObject({ scaledScore: 40, passed: false });
  });

  it('reports the in-progress attempt id and no blocked reason while one is open', async () => {
    fixture = await seedQuizFixture(prisma, { retryCooldownHours: 0 });
    const attempt = await prisma.quizAttempt.create({
      data: {
        quizId: fixture.quizId,
        userId: fixture.studentId,
        attemptNo: 1,
        state: 'in_progress',
        ...(await quizSnapshot()),
      },
    });
    const overview = await service.getLessonOverview(fixture.studentId, fixture.lessonId);
    expect(overview.inProgressAttemptId).toBe(attempt.id);
    expect(overview.blocked).toBeNull();
  });

  it('never carries another student\'s attempt history', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await prisma.quizAttempt.create({
      data: {
        quizId: fixture.quizId,
        userId: fixture.otherStudentId,
        attemptNo: 1,
        state: 'submitted',
        submittedAt: new Date(),
        scaledScore: 90,
        passed: true,
        ...(await quizSnapshot()),
      },
    });
    const overview = await service.getLessonOverview(fixture.studentId, fixture.lessonId);
    expect(overview.attempts).toEqual([]);
  });
});
