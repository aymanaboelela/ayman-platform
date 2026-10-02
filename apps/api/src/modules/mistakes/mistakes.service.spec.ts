import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { MISTAKE_MASTERY_STREAK } from '@ayman/contracts/mistakes';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { seedQuizFixture, type QuizFixture } from '../quiz/testing/quiz-fixtures';
import { MistakesService } from './mistakes.service';

/**
 * `MistakesService` يقرا `attempt_questions` زي `MasteryService` بالظبط —
 * نفس اختصار «حط الصف جاهز، متعملهوش من `submit()` الحقيقي» ونفس السبب.
 */
describe('MistakesService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new MistakesService(prisma);

  let fixture: QuizFixture;
  let optionIds: string[][]; // optionIds[questionIndex][optionIndex], 0 = correct
  const attemptIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    fixture = await seedQuizFixture(prisma, { questionCount: 2 });
    optionIds = await Promise.all(
      fixture.versionIds.map(async (versionId) => {
        const options = await prisma.questionOption.findMany({
          where: { questionVersionId: versionId },
          orderBy: { position: 'asc' },
          select: { id: true },
        });
        return options.map((option) => option.id);
      }),
    );
  });

  afterEach(async () => {
    if (attemptIds.length > 0) {
      await prisma.attemptQuestion.deleteMany({ where: { attemptId: { in: attemptIds } } });
      await prisma.quizAttempt.deleteMany({ where: { id: { in: attemptIds } } });
      attemptIds.length = 0;
    }
    await prisma.mistakeReview.deleteMany({ where: { userId: fixture.studentId } });
    await fixture?.cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** غلطة أو صح على سؤال واحد، في كويز حقيقي مُقفّل (submitted). */
  async function seedResult(args: {
    questionIndex: number;
    right: boolean;
    submittedAt: Date;
  }): Promise<void> {
    const attemptId = randomUUID();
    attemptIds.push(attemptId);
    const quiz = await prisma.quiz.findUniqueOrThrow({
      where: { id: fixture.quizId },
      select: { sumMarks: true, gradeOutOf: true, passPercent: true },
    });
    await prisma.quizAttempt.create({
      data: {
        id: attemptId,
        quizId: fixture.quizId,
        userId: fixture.studentId,
        attemptNo: attemptIds.length,
        paper: 'original',
        state: 'submitted',
        submittedAt: args.submittedAt,
        startedAt: args.submittedAt,
        sumMarks: quiz.sumMarks,
        gradeOutOf: quiz.gradeOutOf,
        passPercent: quiz.passPercent,
      },
    });
    await prisma.attemptQuestion.create({
      data: {
        attemptId,
        slotPosition: 1,
        questionVersionId: fixture.versionIds[args.questionIndex]!,
        optionOrder: [0, 1, 2, 3],
        maxMark: 1,
        minFraction: 0,
        maxFraction: 1,
        mark: args.right ? 1 : 0,
        fraction: args.right ? 1 : 0,
        state: args.right ? 'graded_right' : 'graded_wrong',
        gradedAt: args.submittedAt,
        answeredAt: args.submittedAt,
      },
    });
  }

  it('lists a question the student got wrong, with its course and lesson', async () => {
    await seedResult({ questionIndex: 0, right: false, submittedAt: new Date('2026-05-01T10:00:00Z') });

    const { open, mastered } = await service.notebook(fixture.studentId);

    expect(mastered).toEqual([]);
    expect(open).toHaveLength(1);
    expect(open[0]!.questionVersionId).toBe(fixture.versionIds[0]);
    expect(open[0]!.courseTitle).toBe('كورس الاختبار');
    expect(open[0]!.lessonTitle).toBe('اختبار');
    expect(open[0]!.timesMissed).toBe(1);
    expect(open[0]!.streakRight).toBe(0);
  });

  /**
   * الحارس اللي منعها تقع — `MistakeEntrySchema.options` بيطلب عنصرين على
   * الأقل (`packages/contracts/src/mistakes.ts`)، وقياس على ستاك حقيقي لقى
   * عشرة أسئلة بـ٠ أو ١ خيار. من غير الحارس، سؤال زي ده كان بيعدّي للطالب
   * ويكسر الدفتر كله بخطأ Zod — نفس معاملة السؤال المحذوف تمامًا: يختفي من
   * الدفتر بدل ما يكسره.
   */
  it('drops a question left with fewer than 2 options, instead of crashing the whole notebook', async () => {
    await seedResult({ questionIndex: 0, right: false, submittedAt: new Date('2026-05-01T10:00:00Z') });

    /*
     * `QuestionBankService` (اللي `seedQuizFixture` بيستخدمه) مابيسيبش سؤال
     * بأقل من خيارين — نفس حارس العقد. السؤال التالف ده بيتعمل بإيد من غيره
     * عشان يقلّد الصفوف الحقيقية اللي اتقاست على ستاك فيه (status='ready'،
     * خيار واحد) — نفس الطريقة اللي أي إدخال بإيده بره السيرفيس ممكن يعملها.
     */
    const brokenVersionId = randomUUID();
    await prisma.questionVersion.create({
      data: {
        id: brokenVersionId,
        bankEntryId: fixture.bankEntryIds[0]!,
        version: 2,
        status: 'draft',
        type: 'mcq_single',
        stemHtml: '<p>سؤال تالف</p>',
        createdBy: fixture.adminId,
        options: { create: [{ bodyHtml: 'الاختيار الوحيد', fraction: 1, position: 0 }] },
      },
    });
    // `question_options_freeze` بيمنع تعديل الخيارات أول ما الحالة تبقى
    // `ready` — فالخيار الناقص اتحط وهي لسه `draft`، والتحويل لـ`ready` جاي
    // دلوقتي لوحده. مفيش حارس حاليًا بيمنع التحويل ده بأقل من خيارين —
    // وده بالظبط إزاي الصفوف الحقيقية اللي اتقاست عليها الفحص وصلت للحالة دي.
    await prisma.questionVersion.update({ where: { id: brokenVersionId }, data: { status: 'ready' } });
    await seedResult({ questionIndex: 1, right: false, submittedAt: new Date('2026-05-01T10:00:00Z') });
    // `seedResult` بتاخد index في `fixture.versionIds` — السؤال التالف مش
    // فيها، فبيتحط بإيد بنفس شكل الدالة بالظبط.
    const brokenAttemptId = randomUUID();
    attemptIds.push(brokenAttemptId);
    const quiz = await prisma.quiz.findUniqueOrThrow({
      where: { id: fixture.quizId },
      select: { sumMarks: true, gradeOutOf: true, passPercent: true },
    });
    await prisma.quizAttempt.create({
      data: {
        id: brokenAttemptId,
        quizId: fixture.quizId,
        userId: fixture.studentId,
        attemptNo: attemptIds.length,
        paper: 'original',
        state: 'submitted',
        submittedAt: new Date('2026-05-01T10:00:00Z'),
        startedAt: new Date('2026-05-01T10:00:00Z'),
        sumMarks: quiz.sumMarks,
        gradeOutOf: quiz.gradeOutOf,
        passPercent: quiz.passPercent,
      },
    });
    await prisma.attemptQuestion.create({
      data: {
        attemptId: brokenAttemptId,
        slotPosition: 1,
        questionVersionId: brokenVersionId,
        optionOrder: [0],
        maxMark: 1,
        minFraction: 0,
        maxFraction: 1,
        mark: 0,
        fraction: 0,
        state: 'graded_wrong',
        gradedAt: new Date('2026-05-01T10:00:00Z'),
        answeredAt: new Date('2026-05-01T10:00:00Z'),
      },
    });

    const { open } = await service.notebook(fixture.studentId);

    expect(open).toHaveLength(2);
    expect(open.map((entry) => entry.questionVersionId)).not.toContain(brokenVersionId);
  });

  it('never lists a question the student answered right', async () => {
    await seedResult({ questionIndex: 0, right: true, submittedAt: new Date('2026-05-01T10:00:00Z') });

    const { open, mastered } = await service.notebook(fixture.studentId);

    expect(open).toEqual([]);
    expect(mastered).toEqual([]);
  });

  it('drops a mistake once the LATEST sitting on that question is right', async () => {
    await seedResult({ questionIndex: 0, right: false, submittedAt: new Date('2026-05-01T10:00:00Z') });
    await seedResult({ questionIndex: 0, right: true, submittedAt: new Date('2026-05-02T10:00:00Z') });

    const { open } = await service.notebook(fixture.studentId);

    expect(open).toEqual([]);
  });

  it('a wrong answer in the notebook does not touch a real quiz — only mistake_reviews', async () => {
    await seedResult({ questionIndex: 0, right: false, submittedAt: new Date('2026-05-01T10:00:00Z') });
    const wrongOption = optionIds[0]![1]!;

    const result = await service.answer(fixture.studentId, fixture.versionIds[0]!, [wrongOption]);

    expect(result).toEqual({
      correct: false,
      rightOptionIds: [optionIds[0]![0]],
      streakRight: 0,
      mastered: false,
    });
    const attemptCount = await prisma.attemptQuestion.count({ where: { attemptId: { in: attemptIds } } });
    expect(attemptCount).toBe(1); // still just the one seeded attempt row
  });

  it(`needs ${MISTAKE_MASTERY_STREAK} CONSECUTIVE right answers in the notebook to master a mistake`, async () => {
    await seedResult({ questionIndex: 0, right: false, submittedAt: new Date('2026-05-01T10:00:00Z') });
    const rightOption = optionIds[0]![0]!;
    const wrongOption = optionIds[0]![1]!;

    const first = await service.answer(fixture.studentId, fixture.versionIds[0]!, [rightOption]);
    expect(first).toMatchObject({ correct: true, streakRight: 1, mastered: false });

    let notebook = await service.notebook(fixture.studentId);
    expect(notebook.open).toHaveLength(1); // one right answer is not enough yet

    // A wrong answer breaks the streak back to zero.
    const broken = await service.answer(fixture.studentId, fixture.versionIds[0]!, [wrongOption]);
    expect(broken).toMatchObject({ correct: false, streakRight: 0, mastered: false });

    const second = await service.answer(fixture.studentId, fixture.versionIds[0]!, [rightOption]);
    expect(second).toMatchObject({ correct: true, streakRight: 1, mastered: false });
    const third = await service.answer(fixture.studentId, fixture.versionIds[0]!, [rightOption]);
    expect(third).toMatchObject({ correct: true, streakRight: 2, mastered: true });

    notebook = await service.notebook(fixture.studentId);
    expect(notebook.open).toEqual([]);
    expect(notebook.mastered).toHaveLength(1);
    expect(notebook.mastered[0]!.questionVersionId).toBe(fixture.versionIds[0]);
  });

  it('a mastered question missed AGAIN on a real quiz reopens, with no write to mistake_reviews', async () => {
    await seedResult({ questionIndex: 0, right: false, submittedAt: new Date('2026-05-01T10:00:00Z') });
    const rightOption = optionIds[0]![0]!;
    await service.answer(fixture.studentId, fixture.versionIds[0]!, [rightOption]);
    await service.answer(fixture.studentId, fixture.versionIds[0]!, [rightOption]);
    expect((await service.notebook(fixture.studentId)).mastered).toHaveLength(1);

    // A real quiz miss, AFTER mastery — `masteredAt` was just stamped with the
    // real clock, so this has to be dated after "now", not after the fixture's
    // arbitrary 2026-05-01.
    await seedResult({ questionIndex: 0, right: false, submittedAt: new Date(Date.now() + 60_000) });

    const { open, mastered } = await service.notebook(fixture.studentId);
    expect(mastered).toEqual([]);
    expect(open).toHaveLength(1);
    expect(open[0]!.timesMissed).toBe(2);
  });

  it('404s answering a question that was never one of this student’s mistakes', async () => {
    await expect(
      service.answer(fixture.studentId, fixture.versionIds[1]!, [optionIds[1]![0]!]),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('never mixes one student’s mistakes into another’s', async () => {
    await seedResult({ questionIndex: 0, right: false, submittedAt: new Date('2026-05-01T10:00:00Z') });

    const { open } = await service.notebook(fixture.otherStudentId);

    expect(open).toEqual([]);
  });
});
