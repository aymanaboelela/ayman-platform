// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { StudentQuizHistorySchema } from '@ayman/contracts/quiz/history';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { QuizHistoryService } from './quiz-history.service';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

describe('QuizHistoryService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new QuizHistoryService(prisma);

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

  /**
   * Writes a finished attempt directly. The runner's own path
   * (start → save → submit) is covered exhaustively by `attempt.service.spec`;
   * what this file tests is the FOLD over finished rows, so constructing them
   * is both faster and lets a test state an exact score rather than reverse
   * engineering one from an answer key.
   */
  async function submitAttempt(
    userId: string,
    quizId: string,
    attemptNo: number,
    scaled: number,
    passed: boolean | null,
    submittedAt: Date,
    paper: 'original' | 'improvement' = 'original',
  ) {
    return prisma.quizAttempt.create({
      data: {
        quizId,
        userId,
        attemptNo,
        paper,
        state: 'submitted',
        submittedAt,
        scaledScore: scaled,
        rawScore: scaled,
        sumMarks: 100,
        gradeOutOf: 100,
        passPercent: 50,
        passed,
      },
    });
  }

  it('returns an empty, contract-valid history for a student who has sat nothing', async () => {
    fixture = await seedQuizFixture(prisma, {});

    const history = await service.forUser(fixture.studentId);

    // Parsed, not just eyeballed: `averagePercent: 0` would pass a loose
    // toEqual and is exactly the bug the nullable exists to prevent.
    expect(() => StudentQuizHistorySchema.parse(history)).not.toThrow();
    expect(history.summary).toEqual({
      quizzesTaken: 0,
      attemptsTotal: 0,
      averagePercent: null,
      bestPercent: null,
      passedCount: 0,
    });
    expect(history.series).toEqual([]);
    expect(history.quizzes).toEqual([]);
  });

  it('never returns another student’s attempts', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await submitAttempt(fixture.otherStudentId, fixture.quizId, 1, 90, true, new Date());

    const history = await service.forUser(fixture.studentId);

    expect(history.series).toEqual([]);
    expect(history.summary.attemptsTotal).toBe(0);
  });

  it('excludes attempts that were never submitted', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await prisma.quizAttempt.create({
      data: {
        quizId: fixture.quizId,
        userId: fixture.studentId,
        attemptNo: 1,
        state: 'in_progress',
        sumMarks: 100,
        gradeOutOf: 100,
        passPercent: 50,
      },
    });

    const history = await service.forUser(fixture.studentId);

    // An in-flight attempt has no score, and letting it through would drag the
    // average down by a zero the student never earned.
    expect(history.summary.attemptsTotal).toBe(0);
    expect(history.quizzes).toEqual([]);
  });

  it('averages over attempts and reports the best', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await submitAttempt(fixture.studentId, fixture.quizId, 1, 40, false, new Date('2026-01-01'));
    await submitAttempt(fixture.studentId, fixture.quizId, 2, 80, true, new Date('2026-01-02'));

    const history = await service.forUser(fixture.studentId);

    expect(history.summary.attemptsTotal).toBe(2);
    expect(history.summary.averagePercent).toBe(60);
    expect(history.summary.bestPercent).toBe(80);
  });

  it('counts a pass once per QUIZ, on the best attempt — not once per attempt', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await submitAttempt(fixture.studentId, fixture.quizId, 1, 30, false, new Date('2026-01-01'));
    await submitAttempt(fixture.studentId, fixture.quizId, 2, 30, false, new Date('2026-01-02'));
    await submitAttempt(fixture.studentId, fixture.quizId, 3, 95, true, new Date('2026-01-03'));

    const history = await service.forUser(fixture.studentId);

    // One quiz, passed. Counting attempts would report "1 of 3" and tell a
    // student who passed that they mostly failed.
    expect(history.summary.quizzesTaken).toBe(1);
    expect(history.summary.passedCount).toBe(1);
    expect(history.quizzes).toHaveLength(1);
    expect(history.quizzes[0]?.passed).toBe(true);
  });

  it('a worse later attempt does not un-pass a quiz, and does not lower the best', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await submitAttempt(fixture.studentId, fixture.quizId, 1, 90, true, new Date('2026-01-01'));
    await submitAttempt(fixture.studentId, fixture.quizId, 2, 20, false, new Date('2026-01-02'));

    const history = await service.forUser(fixture.studentId);
    const row = history.quizzes[0];

    expect(row?.passed).toBe(true);
    expect(row?.bestPercent).toBe(90);
    // `latest` still tells the truth about the most recent sitting — the row
    // reports both because they answer different questions.
    expect(row?.latestPercent).toBe(20);
  });

  it('orders the series oldest-first and the quiz rows most-recent-first', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await submitAttempt(fixture.studentId, fixture.quizId, 1, 50, true, new Date('2026-01-01'));
    await submitAttempt(fixture.studentId, fixture.quizId, 2, 60, true, new Date('2026-02-01'));

    const history = await service.forUser(fixture.studentId);

    // The chart walks `series` in array order, so this ordering IS the x-axis.
    expect(history.series.map((point) => point.scorePercent)).toEqual([50, 60]);
    expect(history.quizzes[0]?.latestAttemptId).toBe(history.series[1]?.attemptId);
  });

  it('reports an ordinary quiz as offering no improvement sitting', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await submitAttempt(fixture.studentId, fixture.quizId, 1, 70, true, new Date());

    const history = await service.forUser(fixture.studentId);

    expect(history.quizzes[0]?.allowsImprovement).toBe(false);
    expect(history.quizzes[0]?.improvementUsed).toBe(false);
  });

  it('reports an exam whose improvement sitting is still available', async () => {
    fixture = await seedQuizFixture(prisma, {
      allowsImprovement: true,
      improvementQuestionCount: 2,
    });
    await submitAttempt(fixture.studentId, fixture.quizId, 1, 55, true, new Date('2026-01-01'));

    const history = await service.forUser(fixture.studentId);

    expect(history.quizzes[0]?.allowsImprovement).toBe(true);
    expect(history.quizzes[0]?.improvementUsed).toBe(false);
  });

  it('marks the improvement sitting used once it has been sat', async () => {
    fixture = await seedQuizFixture(prisma, {
      allowsImprovement: true,
      improvementQuestionCount: 2,
    });
    await submitAttempt(fixture.studentId, fixture.quizId, 1, 55, true, new Date('2026-01-01'));
    await submitAttempt(
      fixture.studentId,
      fixture.quizId,
      2,
      80,
      true,
      new Date('2026-01-02'),
      'improvement',
    );

    const history = await service.forUser(fixture.studentId);

    expect(history.quizzes[0]?.attemptsUsed).toBe(2);
    expect(history.quizzes[0]?.improvementUsed).toBe(true);
    // The higher of the two, which is the whole point of an improvement sitting.
    expect(history.quizzes[0]?.bestPercent).toBe(80);
  });

  /*
   * A weaker improvement must not cost the student the grade they already
   * hold — the promise the pre-sitting dialog makes in so many words.
   */
  it('keeps the original as the best when the improvement scored lower', async () => {
    fixture = await seedQuizFixture(prisma, {
      allowsImprovement: true,
      improvementQuestionCount: 2,
    });
    await submitAttempt(fixture.studentId, fixture.quizId, 1, 90, true, new Date('2026-01-01'));
    await submitAttempt(
      fixture.studentId,
      fixture.quizId,
      2,
      40,
      false,
      new Date('2026-01-02'),
      'improvement',
    );

    const history = await service.forUser(fixture.studentId);

    expect(history.quizzes[0]?.bestPercent).toBe(90);
    expect(history.quizzes[0]?.passed).toBe(true);
  });

  it('does not divide by zero when an attempt was marked out of nothing', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await prisma.quizAttempt.create({
      data: {
        quizId: fixture.quizId,
        userId: fixture.studentId,
        attemptNo: 1,
        state: 'submitted',
        submittedAt: new Date(),
        scaledScore: 0,
        rawScore: 0,
        sumMarks: 0,
        // A quiz whose slots all failed to resolve. Infinity or NaN here fails
        // the contract's `.max(100)` and takes the whole page down.
        gradeOutOf: 0,
        passPercent: 50,
        passed: false,
      },
    });

    const history = await service.forUser(fixture.studentId);

    expect(() => StudentQuizHistorySchema.parse(history)).not.toThrow();
    expect(history.series[0]?.scorePercent).toBe(0);
  });
});
