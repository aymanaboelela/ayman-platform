import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';
import { QuestionBankService } from './question-bank.service';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

describe('AnalyticsService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new AnalyticsService(prisma);
  const bank = new QuestionBankService(prisma);

  let fixture: QuizFixture;
  const extraUserIds: string[] = [];
  const extraAttemptIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (extraAttemptIds.length > 0) {
      await prisma.attemptQuestion.deleteMany({ where: { attemptId: { in: extraAttemptIds } } });
      await prisma.quizAttempt.deleteMany({ where: { id: { in: extraAttemptIds } } });
      extraAttemptIds.length = 0;
    }
    if (extraUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: extraUserIds } } });
      extraUserIds.length = 0;
    }
    await fixture?.cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * Inserts a fully-formed, already-graded attempt directly (bypassing the
   * real start/save/submit HTTP flow) — the analytics service reads straight
   * off `quiz_attempts`/`attempt_questions`, so a synthetic historical row is
   * indistinguishable from a real one for its purposes, and building ten of
   * them through the real flow would make this file the slowest in the suite
   * for no extra coverage.
   */
  async function seedAttempt(args: {
    scaledScore: number;
    passed: boolean;
    state?: 'submitted' | 'pending_review' | 'in_progress' | 'abandoned';
    questionFractions: { versionId: string; fraction: number; optionIds?: string[] }[];
  }): Promise<void> {
    const userId = randomUUID();
    await prisma.user.create({
      data: { id: userId, name: 'Historical Student', email: `${userId}@example.test`, role: 'student' },
    });
    extraUserIds.push(userId);

    const attempt = await prisma.quizAttempt.create({
      data: {
        quizId: fixture.quizId,
        userId,
        attemptNo: 1,
        state: args.state ?? 'submitted',
        startedAt: new Date(),
        submittedAt: args.state === 'in_progress' ? null : new Date(),
        scaledScore: args.state === 'in_progress' ? null : args.scaledScore,
        rawScore: args.state === 'in_progress' ? null : args.scaledScore,
        passed: args.state === 'in_progress' ? null : args.passed,
      },
      select: { id: true },
    });
    extraAttemptIds.push(attempt.id);

    for (const [index, question] of args.questionFractions.entries()) {
      await prisma.attemptQuestion.create({
        data: {
          attemptId: attempt.id,
          slotPosition: index,
          questionVersionId: question.versionId,
          optionOrder: [0, 1, 2, 3],
          maxMark: 1,
          minFraction: 0,
          maxFraction: 1,
          fraction: question.fraction,
          mark: question.fraction,
          state: question.fraction >= 0.999999 ? 'graded_right' : question.fraction < 0.000001 ? 'graded_wrong' : 'graded_partial',
          response: question.optionIds ? { kind: 'choice', optionIds: question.optionIds } : undefined,
        },
      });
    }
  }

  it('reports the mean, median and pass rate over submitted attempts only', async () => {
    fixture = await seedQuizFixture(prisma, { questionCount: 1 });
    await seedAttempt({ scaledScore: 100, passed: true, questionFractions: [{ versionId: fixture.versionIds[0]!, fraction: 1 }] });
    await seedAttempt({ scaledScore: 0, passed: false, questionFractions: [{ versionId: fixture.versionIds[0]!, fraction: 0 }] });
    await seedAttempt({ scaledScore: 50, passed: false, questionFractions: [{ versionId: fixture.versionIds[0]!, fraction: 0.5 }] });

    const result = await service.forQuiz(fixture.quizId);
    expect(result.attemptCount).toBe(3);
    expect(result.meanScore).toBeCloseTo(50, 5);
    expect(result.medianScore).toBe(50);
    expect(result.passRate).toBeCloseTo(1 / 3, 5);
  });

  it('excludes in_progress and abandoned attempts from every statistic', async () => {
    fixture = await seedQuizFixture(prisma, { questionCount: 1 });
    await seedAttempt({ scaledScore: 100, passed: true, questionFractions: [{ versionId: fixture.versionIds[0]!, fraction: 1 }] });
    await seedAttempt({
      scaledScore: 0,
      passed: false,
      state: 'in_progress',
      questionFractions: [],
    });

    const result = await service.forQuiz(fixture.quizId);
    expect(result.attemptCount).toBe(1);
    expect(result.meanScore).toBe(100);
  });

  it('folds a perfect score into the top bucket rather than an eleventh', async () => {
    fixture = await seedQuizFixture(prisma, { questionCount: 1 });
    await seedAttempt({ scaledScore: 100, passed: true, questionFractions: [{ versionId: fixture.versionIds[0]!, fraction: 1 }] });

    const result = await service.forQuiz(fixture.quizId);
    expect(result.distribution.every((row) => row.bucket <= 10)).toBe(true);
    expect(result.distribution.find((row) => row.bucket === 10)?.n).toBe(1);
  });

  it('returns facility 1 for a question everybody got right', async () => {
    fixture = await seedQuizFixture(prisma, { questionCount: 1 });
    await seedAttempt({ scaledScore: 100, passed: true, questionFractions: [{ versionId: fixture.versionIds[0]!, fraction: 1 }] });
    await seedAttempt({ scaledScore: 100, passed: true, questionFractions: [{ versionId: fixture.versionIds[0]!, fraction: 1 }] });

    const result = await service.forQuiz(fixture.quizId);
    const item = result.items.find((row) => row.questionVersionId === fixture.versionIds[0]);
    expect(item!.facility).toBe(1);
  });

  it('reports null discrimination with fewer than 10 attempts', async () => {
    fixture = await seedQuizFixture(prisma, { questionCount: 1 });
    await seedAttempt({ scaledScore: 100, passed: true, questionFractions: [{ versionId: fixture.versionIds[0]!, fraction: 1 }] });

    const result = await service.forQuiz(fixture.quizId);
    const item = result.items.find((row) => row.questionVersionId === fixture.versionIds[0]);
    expect(item!.discrimination).toBeNull();
  });

  it('computes a real discrimination index once there are at least 10 attempts', async () => {
    fixture = await seedQuizFixture(prisma, { questionCount: 1 });
    for (let i = 0; i < 10; i += 1) {
      await seedAttempt({
        scaledScore: 100 - i,
        passed: true,
        questionFractions: [{ versionId: fixture.versionIds[0]!, fraction: 1 }],
      });
    }
    for (let i = 0; i < 10; i += 1) {
      await seedAttempt({
        scaledScore: 10 - i,
        passed: false,
        questionFractions: [{ versionId: fixture.versionIds[0]!, fraction: 0 }],
      });
    }

    const result = await service.forQuiz(fixture.quizId);
    const item = result.items.find((row) => row.questionVersionId === fixture.versionIds[0]);
    expect(item!.discrimination).toBe(1);
  });

  it('flags a distractor picked more often than the key', async () => {
    fixture = await seedQuizFixture(prisma, { questionCount: 1 });
    const version = await prisma.questionVersion.findUniqueOrThrow({
      where: { id: fixture.versionIds[0] },
      include: { options: { orderBy: { position: 'asc' } } },
    });
    const key = version.options.find((option) => Number(option.fraction) === 1)!;
    const distractor = version.options.find((option) => Number(option.fraction) === 0)!;

    // Two students picked the WRONG option, one picked the key — the
    // distractor out-picks the key.
    await seedAttempt({
      scaledScore: 100,
      passed: true,
      questionFractions: [{ versionId: version.id, fraction: 1, optionIds: [key.id] }],
    });
    await seedAttempt({
      scaledScore: 0,
      passed: false,
      questionFractions: [{ versionId: version.id, fraction: 0, optionIds: [distractor.id] }],
    });
    await seedAttempt({
      scaledScore: 0,
      passed: false,
      questionFractions: [{ versionId: version.id, fraction: 0, optionIds: [distractor.id] }],
    });

    const result = await service.forQuiz(fixture.quizId);
    const item = result.items.find((row) => row.questionVersionId === version.id)!;
    const keyPicks = item.distractors.find((d) => d.optionId === key.id)?.picks ?? 0;
    const distractorPicks = item.distractors.find((d) => d.optionId === distractor.id)?.picks ?? 0;
    expect(distractorPicks).toBeGreaterThan(keyPicks);
  });

  it('groups by question VERSION, so editing a question does not merge two different items', async () => {
    fixture = await seedQuizFixture(prisma, { questionCount: 1 });
    const oldVersionId = fixture.versionIds[0]!;
    await seedAttempt({ scaledScore: 100, passed: true, questionFractions: [{ versionId: oldVersionId, fraction: 1 }] });

    // Edit and republish — a NEW version id.
    const draft = await bank.saveDraft(
      fixture.bankEntryIds[0]!,
      {
        type: 'mcq_single',
        categoryId: fixture.categoryId,
        stemHtml: '<p>نسخة جديدة</p>',
        defaultMark: 1,
        settings: { shuffleOptions: true, caseSensitive: false },
        options: [
          { bodyHtml: '<p>أ</p>', fraction: 1 },
          { bodyHtml: '<p>ب</p>', fraction: 0 },
        ],
      } as never,
      fixture.adminId,
    );
    await bank.publish(draft.versionId);
    await seedAttempt({ scaledScore: 0, passed: false, questionFractions: [{ versionId: draft.versionId, fraction: 0 }] });

    const result = await service.forQuiz(fixture.quizId);
    const oldItem = result.items.find((row) => row.questionVersionId === oldVersionId);
    const newItem = result.items.find((row) => row.questionVersionId === draft.versionId);
    expect(oldItem!.n).toBe(1);
    expect(oldItem!.facility).toBe(1);
    expect(newItem!.n).toBe(1);
    expect(newItem!.facility).toBe(0);
  });
});
