import { RecentScoreSchema } from '@ayman/contracts/progress';
import { QuizScoreFeed } from './quiz-score-feed';

/**
 * In-memory stand-in for `quizAttempt.findMany`: what matters here is the
 * arithmetic, and the contract it has to satisfy — one percent over 100 fails
 * `RecentScoreSchema` and with it the student's whole dashboard.
 */
function feedOver(rows: Array<{ scaledScore: number | null; gradeOutOf: number; quizGradeOutOf: number }>) {
  const prisma = {
    quizAttempt: {
      findMany: jest.fn(async () =>
        rows.map((row, i) => ({
          id: `attempt-${i}`,
          submittedAt: new Date('2026-10-27T07:21:00Z'),
          scaledScore: row.scaledScore,
          gradeOutOf: row.gradeOutOf,
          quiz: {
            gradeOutOf: row.quizGradeOutOf,
            lesson: { title: 'كويز', course: { slug: 'course' } },
          },
        })),
      ),
    },
  };
  return new QuizScoreFeed(prisma as never);
}

describe('QuizScoreFeed', () => {
  it('divides by the attempt’s own gradeOutOf, not the quiz’s current one', async () => {
    // Sat out of 40, then the teacher lowered the quiz to 20.
    const [score] = await feedOver([{ scaledScore: 30, gradeOutOf: 40, quizGradeOutOf: 20 }]).recentFor('u', 5);

    expect(score!.scorePercent).toBe(75);
  });

  it('never puts a percent outside 0–100 on the wire', async () => {
    const scores = await feedOver([
      { scaledScore: 25, gradeOutOf: 20, quizGradeOutOf: 20 },
      { scaledScore: -3, gradeOutOf: 20, quizGradeOutOf: 20 },
      { scaledScore: 5, gradeOutOf: 0, quizGradeOutOf: 0 },
      { scaledScore: null, gradeOutOf: 20, quizGradeOutOf: 20 },
    ]).recentFor('u', 5);

    expect(scores.map((s) => s.scorePercent)).toEqual([100, 0, 0, 0]);
    for (const score of scores) expect(() => RecentScoreSchema.parse(score)).not.toThrow();
  });
});
