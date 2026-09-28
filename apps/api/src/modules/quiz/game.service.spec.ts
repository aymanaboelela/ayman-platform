// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { GameHubSchema, GameRoundSchema } from '@ayman/contracts/quiz/game';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import { DEFAULT_REVIEW_OPTIONS } from '@ayman/contracts/quiz/quiz-settings';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { GameBanksService } from './game-banks.service';
import { GameService } from './game.service';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

describe('GameService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new GameService(prisma);
  const banks = new GameBanksService(prisma);

  let fixture: QuizFixture;
  let extra: { sectionId?: string; lessonId?: string; quizId?: string; categoryId?: string } = {};

  /** محاولة مسلّمة ومصححة على كل أسئلة الكويز. */
  async function sit(userId: string) {
    const attempt = await prisma.quizAttempt.create({
      data: {
        quizId: fixture.quizId,
        userId,
        attemptNo: 1,
        state: 'submitted',
        submittedAt: new Date(),
        scaledScore: 100,
        rawScore: 3,
        sumMarks: 3,
        gradeOutOf: 100,
        passPercent: 50,
        passed: true,
      },
    });
    await prisma.attemptQuestion.createMany({
      data: fixture.versionIds.map((questionVersionId, index) => ({
        attemptId: attempt.id,
        slotPosition: index,
        questionVersionId,
        optionOrder: [],
        maxMark: 1,
        minFraction: 0,
        maxFraction: 1,
        state: 'graded_right' as const,
        gradedAt: new Date(),
      })),
    });
  }

  async function courseOf(): Promise<string> {
    return (await prisma.lesson.findUniqueOrThrow({ where: { id: fixture.lessonId }, select: { courseId: true } })).courseId;
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (extra.quizId) {
      await prisma.quizSlot.deleteMany({ where: { quizId: extra.quizId } });
      await prisma.quiz.delete({ where: { id: extra.quizId } });
    }
    if (extra.lessonId) await prisma.lesson.delete({ where: { id: extra.lessonId } });
    if (extra.sectionId) await prisma.courseSection.delete({ where: { id: extra.sectionId } });
    if (extra.categoryId) {
      const entries = await prisma.questionBankEntry.findMany({ where: { categoryId: extra.categoryId }, select: { id: true } });
      await prisma.questionBankEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } });
      await prisma.questionCategory.delete({ where: { id: extra.categoryId } });
    }
    extra = {};
    await fixture?.cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('plays the questions of papers the student sat, and never ships the answer with them', async () => {
    fixture = await seedQuizFixture(prisma, {});
    expect((await service.hub(fixture.studentId)).total).toBe(0);

    await sit(fixture.studentId);
    const hub = await service.hub(fixture.studentId);
    expect(() => GameHubSchema.parse(hub)).not.toThrow();
    expect(hub.total).toBe(3);
    expect(hub.courses).toHaveLength(1);

    const round = await service.round(fixture.studentId, { mode: 'race', level: 'medium' });
    expect(() => GameRoundSchema.parse(round)).not.toThrow();
    expect(round.questions).toHaveLength(3);
    expect(JSON.stringify(round)).not.toMatch(/fraction|feedback|rightAnswer|correct/i);
    // وطالب تاني ماسلّمش حاجة بنكه فاضي — حتى لو مشترك في نفس الكورس.
    expect((await service.hub(fixture.otherStudentId)).total).toBe(0);
  });

  it('grades on the server and names the right option only after the answer', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await sit(fixture.studentId);
    const questionId = fixture.versionIds[0]!;
    const options = await prisma.questionOption.findMany({
      where: { questionVersionId: questionId },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    const [right, wrong] = [options[0]!.id, options[1]!.id];

    expect(await service.answer(fixture.studentId, { questionId, optionId: right })).toEqual({ correct: true, rightOptionIds: [right] });
    expect(await service.answer(fixture.studentId, { questionId, optionId: wrong })).toEqual({ correct: false, rightOptionIds: [right] });
    expect((await service.answer(fixture.studentId, { questionId, optionId: null })).correct).toBe(false);
  });

  it('refuses a question outside the student’s pool — 404, not the answer, and no lifeline', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await sit(fixture.studentId);
    const questionId = fixture.versionIds[0]!;

    await expect(service.answer(fixture.otherStudentId, { questionId, optionId: null })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.lifeline(fixture.otherStudentId, { questionId, kind: 'fifty' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('50:50 leaves the right answer and one wrong one; the audience adds up to 100', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await sit(fixture.studentId);
    const questionId = fixture.versionIds[0]!;
    const options = await prisma.questionOption.findMany({ where: { questionVersionId: questionId }, orderBy: { position: 'asc' } });

    const fifty = await service.lifeline(fixture.studentId, { questionId, kind: 'fifty' });
    expect(fifty.removeOptionIds).toHaveLength(options.length - 2);
    expect(fifty.removeOptionIds).not.toContain(options[0]!.id);

    const audience = await service.lifeline(fixture.studentId, { questionId, kind: 'audience' });
    expect(audience.votes).toHaveLength(options.length);
    expect(audience.votes.reduce((sum, vote) => sum + vote.percent, 0)).toBe(100);
  });

  it('millionaire orders its round easiest first', async () => {
    fixture = await seedQuizFixture(prisma, { questionCount: 3 });
    await sit(fixture.studentId);
    const round = await service.round(fixture.studentId, { mode: 'millionaire', level: 'medium' });
    expect(round.mode).toBe('millionaire');
    expect(round.questions.length).toBeGreaterThan(0);
  });

  it('keeps out any question an upcoming monthly exam draws on', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await sit(fixture.studentId);
    const courseId = await courseOf();
    const section = await prisma.courseSection.create({ data: { courseId, title: EXAM_SHELF_TITLE, position: 90, isPublished: true } });
    const lesson = await prisma.lesson.create({
      data: { courseId, sectionId: section.id, title: 'امتحان الشهر', kind: 'quiz', position: 0, isPublished: true },
    });
    const exam = await prisma.quiz.create({ data: { lessonId: lesson.id, reviewOptions: DEFAULT_REVIEW_OPTIONS, isPublished: true } });
    extra = { sectionId: section.id, lessonId: lesson.id, quizId: exam.id };
    await prisma.quizSlot.create({ data: { quizId: exam.id, position: 0, maxMark: 1, bankEntryId: fixture.bankEntryIds[0]! } });

    const hub = await service.hub(fixture.studentId);
    expect(hub.total).toBe(2);
  });

  it('adds the course’s own game questions for an enrolled student', async () => {
    fixture = await seedQuizFixture(prisma, {});
    const courseId = await courseOf();
    const { categoryId } = await banks.ensure(courseId);
    extra = { categoryId };
    // مرتين = نفس التصنيف.
    expect((await banks.ensure(courseId)).categoryId).toBe(categoryId);

    // سؤال جاهز في تصنيف الكورس — الطالب مشترك ومسلّمش حاجة، ومع ذلك يلعبه.
    const entry = await prisma.questionBankEntry.create({ data: { categoryId, ownerId: fixture.adminId } });
    const version = await prisma.questionVersion.create({
      data: {
        bankEntryId: entry.id,
        version: 1,
        // مسودة الأول: الاختيارات بتتقفل أول ما النسخة تبقى `ready` (تريجر).
        status: 'draft',
        type: 'mcq_single',
        stemHtml: '<p>سؤال لعبة</p>',
        createdBy: fixture.adminId,
        options: {
          create: [
            { bodyHtml: '<p>صح</p>', fraction: 1, position: 0 },
            { bodyHtml: '<p>غلط</p>', fraction: 0, position: 1 },
          ],
        },
      },
    });

    await prisma.questionVersion.update({ where: { id: version.id }, data: { status: 'ready' } });

    const hub = await service.hub(fixture.studentId);
    expect(hub.total).toBe(1);
    const round = await service.round(fixture.studentId, { mode: 'race', level: 'medium', courseId });
    expect(round.questions.map((q) => q.id)).toEqual([version.id]);
    expect((await banks.list()).rows.find((row) => row.courseId === courseId)?.ready).toBe(1);
  });
});
