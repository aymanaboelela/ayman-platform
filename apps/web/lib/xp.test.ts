import { describe, expect, it } from 'vitest';
import { xpFor } from './xp';

describe('xpFor', () => {
  it('is zero for a student who has done nothing yet', () => {
    expect(xpFor({ completedLessons: 0, passedQuizCount: 0, completedCourseCount: 0 })).toBe(0);
  });

  it('weighs a completed lesson at 10', () => {
    expect(xpFor({ completedLessons: 1, passedQuizCount: 0, completedCourseCount: 0 })).toBe(10);
  });

  it('weighs a passed quiz at 30', () => {
    expect(xpFor({ completedLessons: 0, passedQuizCount: 1, completedCourseCount: 0 })).toBe(30);
  });

  it('weighs a finished course at 100', () => {
    expect(xpFor({ completedLessons: 0, passedQuizCount: 0, completedCourseCount: 1 })).toBe(100);
  });

  it('sums all three independently', () => {
    // 5 lessons + 2 passed quizzes + 1 finished course = 50 + 60 + 100 = 210.
    expect(xpFor({ completedLessons: 5, passedQuizCount: 2, completedCourseCount: 1 })).toBe(210);
  });
});
