import 'dotenv/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { QuizAccessService } from './quiz-access.service';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

describe('QuizAccessService.assertCanAttempt', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new QuizAccessService(prisma);
  const lessonAccess = new LessonAccessService(prisma);

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
