// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { GameStatsSchema, StudentGameSummarySchema } from '@ayman/contracts/quiz/game-stats';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { GameStatsService, plainStem } from './game-stats.service';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

describe('GameStatsService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new GameStatsService(prisma);
  let fixture: QuizFixture;

  /** الإحصائيات للطلبة بس — `role = student` وليه بروفايل، زي كل التحليلات. */
  async function profile(userId: string, fullName: string) {
    await prisma.studentProfile.create({
      data: {
        userId,
        fullName,
        gender: 'female',
        phone: `011${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
        governorateCode: (await prisma.governorate.findFirstOrThrow()).code,
      },
    });
  }

  /** جولة مكتوبة زي ما `GameService` بيكتبها: إجابة صف، والعدّادات عليها. */
  async function play(
    userId: string,
    input: { mode: 'race' | 'millionaire' | 'survival'; answers: boolean[]; seconds: number; score: number; ended?: boolean },
  ) {
    const startedAt = new Date(Date.now() - input.seconds * 1000 - 60_000);
    const questionIds = fixture.versionIds.slice(0, input.answers.length);
    const session = await prisma.gameSession.create({
      data: {
        userId,
        courseId: fixture.courseId,
        mode: input.mode,
        level: 'medium',
        questionIds: fixture.versionIds,
        questionCount: fixture.versionIds.length,
        answered: input.answers.length,
        correct: input.answers.filter(Boolean).length,
        score: input.score,
        outcome: input.ended === false ? null : 'finished',
        durationSeconds: input.seconds,
        startedAt,
        lastActivityAt: startedAt,
        endedAt: input.ended === false ? null : new Date(startedAt.getTime() + input.seconds * 1000),
      },
    });
    await prisma.gameAnswer.createMany({
      data: questionIds.map((questionVersionId, i) => ({
        sessionId: session.id,
        questionVersionId,
        correct: input.answers[i]!,
      })),
    });
    return session.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await fixture?.cleanup();
    // التست التالت مابيعملش فيكستشر — من غير ده كان هيمسح نفس الفيكستشر مرتين.
    fixture = undefined as unknown as QuizFixture;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('adds up plays, players and time per mode, day and player — students only', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await profile(fixture.studentId, 'مريم');
    await profile(fixture.otherStudentId, 'سلمى');

    // مريم: ٤ جولات، والسؤال الأول غلط في كلهم. سلمى: جولة واحدة طويلة.
    for (let i = 0; i < 4; i++) {
      await play(fixture.studentId, { mode: 'race', answers: [false, true], seconds: 60, score: 150 + i });
    }
    await play(fixture.otherStudentId, { mode: 'millionaire', answers: [false, true, true], seconds: 600, score: 0 });
    // جولة ماخلصتش: بتتعدّ في الوقت، ومش في «خلصت».
    await play(fixture.otherStudentId, { mode: 'survival', answers: [true], seconds: 30, score: 0, ended: false });
    // والأدمن وهو بيجرّب مش لاعب.
    await play(fixture.adminId, { mode: 'race', answers: [true], seconds: 999, score: 999 });

    const stats = await service.stats({ period: '7d', courseId: fixture.courseId });
    expect(() => GameStatsSchema.parse(stats)).not.toThrow();
    expect(stats.totals).toMatchObject({
      plays: 6,
      players: 2,
      seconds: 4 * 60 + 600 + 30,
      finished: 5,
      answered: 4 * 2 + 3 + 1,
      correct: 4 + 2 + 1,
    });
    expect(stats.totals.avgSecondsPerPlayer).toBe((4 * 60 + 630) / 2);
    expect(stats.daily).toHaveLength(7);
    expect(stats.daily.reduce((sum, day) => sum + day.plays, 0)).toBe(6);
    expect(stats.byHour.reduce((sum, n) => sum + n, 0)).toBe(6);

    const race = stats.byMode.find((row) => row.mode === 'race')!;
    expect(race).toMatchObject({ plays: 4, players: 1, seconds: 240, bestScore: 153, levels: { easy: 0, medium: 4, hard: 0 } });
    expect(race.correctRate).toBe(0.5);

    expect(stats.topByPlays[0]).toMatchObject({ userId: fixture.studentId, name: 'مريم', plays: 4 });
    expect(stats.topByTime[0]).toMatchObject({ userId: fixture.otherStudentId, seconds: 630 });
    expect(stats.topByScore.race.map((row) => row.bestScore)).toEqual([153]);
    expect(stats.recent).toHaveLength(6);
    expect(stats.recent.find((row) => row.outcome === null)?.mode).toBe('survival');
    expect(stats.byCourse).toEqual([
      expect.objectContaining({ courseId: fixture.courseId, plays: 6, players: 2 }),
    ]);

    // السؤال الأول: ٦ إجابات، واحدة بس صح — أصعب سؤال. التاني عليه ٥ صح،
    // والتالت إجابة واحدة (أقل من ٥) فمش في القايمة.
    expect(stats.hardest[0]).toMatchObject({ questionId: fixture.versionIds[0], answers: 6, correct: 1 });
    expect(stats.hardest.find((row) => row.questionId === fixture.versionIds[1])?.rate).toBe(1);
    expect(stats.hardest.some((row) => row.questionId === fixture.versionIds[2])).toBe(false);

    const one = await service.student(fixture.studentId);
    expect(() => StudentGameSummarySchema.parse(one)).not.toThrow();
    expect(one).toMatchObject({ plays: 4, seconds: 240, answered: 8, correct: 4 });
    expect(one.byMode.find((row) => row.mode === 'race')).toMatchObject({ plays: 4, bestScore: 153 });
    expect(one.recent).toHaveLength(4);
  });

  it('is empty, not broken, for a period nobody played in', async () => {
    fixture = await seedQuizFixture(prisma, {});
    const stats = await service.stats({ period: '28d', courseId: fixture.courseId });
    expect(stats.totals).toMatchObject({ plays: 0, players: 0, seconds: 0, avgSeconds: null, correctRate: null });
    expect(stats.daily).toHaveLength(28);
    expect(stats.byMode.every((row) => row.plays === 0)).toBe(true);
    expect((await service.student('no-such-student')).plays).toBe(0);
  });

  it('turns a stem into one plain line', () => {
    expect(plainStem('<p>ناتج <strong>2 &amp; 3</strong></p><p>كام؟</p>')).toBe('ناتج 2 & 3 كام؟');
    expect(plainStem(`<p>${'أ'.repeat(400)}</p>`)).toHaveLength(160);
  });
});
