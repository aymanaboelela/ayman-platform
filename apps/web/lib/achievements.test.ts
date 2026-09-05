import { describe, expect, it } from 'vitest';
import type { Dashboard, EnrolledCourse, QuizHistorySummary } from '@ayman/contracts';
import { achievementsFor, earnedCount } from './achievements';

function course(overrides: Partial<EnrolledCourse> = {}): EnrolledCourse {
  return {
    id: 'c1',
    slug: 'c1',
    title: 'كورس',
    coverKey: null,
    subjectNameAr: 'الفيزياء',
    contentComplete: false,
    // Published unless a case says otherwise — a course the instructor has
    // taken down is the exception, and `EnrolledCourseSchema.published` says
    // why it is on the wire at all.
    published: true,
    progressPercent: 0,
    completedLessons: 0,
    totalLessons: 6,
    lastLessonId: null,
    subscriptionValidUntil: null,
    comingSoonNote: null,
    scheduleNote: null,
    bookTitle: null,
    bookPriceCents: null,
    ...overrides,
  };
}

function dashboard(courses: EnrolledCourse[] = []): Dashboard {
  return {
    continueWatching: null,
    enrolledCourses: courses,
    recentScores: [],
    totalWatchedSeconds: 0,
    pendingExams: [],
  };
}

function summary(overrides: Partial<QuizHistorySummary> = {}): QuizHistorySummary {
  return {
    quizzesTaken: 0,
    attemptsTotal: 0,
    averagePercent: null,
    bestPercent: null,
    passedCount: 0,
    ...overrides,
  };
}

const idsOf = (list: ReturnType<typeof achievementsFor>) =>
  list.filter((badge) => badge.earned).map((badge) => badge.id);

describe('achievementsFor', () => {
  it('renders every marker on day one, earned or not', () => {
    // A strip that shows only what is earned is EMPTY for a new student —
    // which is exactly when it has to say what the block is for.
    const badges = achievementsFor({
      dashboard: dashboard(),
      summary: summary(),
      completedLessons: 0,
    });
    expect(badges).toHaveLength(6);
    expect(idsOf(badges)).toEqual([]);
    expect(badges.every((badge) => badge.hint.length > 0)).toBe(true);
  });

  it('ladders on lesson count', () => {
    const one = achievementsFor({
      dashboard: dashboard(),
      summary: summary(),
      completedLessons: 1,
    });
    expect(idsOf(one)).toEqual(['first-lesson']);

    const ten = achievementsFor({
      dashboard: dashboard(),
      summary: summary(),
      completedLessons: 10,
    });
    expect(idsOf(ten)).toEqual(['first-lesson', 'ten-lessons']);
  });

  it('separates sitting an exam from passing one', () => {
    // Both flags matter: a student who has sat three exams and failed all three
    // has earned «أول امتحان» and not «أول نجاح». Collapsing the two into one
    // truthiness check is what would award both.
    const badges = achievementsFor({
      dashboard: dashboard(),
      summary: summary({ quizzesTaken: 3, attemptsTotal: 3, passedCount: 0 }),
      completedLessons: 0,
    });
    expect(idsOf(badges)).toEqual(['first-exam']);
  });

  it('awards «كورس كامل» when completedLessons has caught up to totalLessons, even past it', () => {
    // `>=` rather than `===`: a course whose lesson count shrank after some
    // of it was already completed can arrive with completedLessons ahead of
    // totalLessons, and `===` would silently never award this.
    const badges = achievementsFor({
      dashboard: dashboard([course({ completedLessons: 7, totalLessons: 6 })]),
      summary: summary(),
      completedLessons: 6,
    });
    expect(idsOf(badges)).toContain('course-done');
  });

  it('does not award «كورس كامل» for a course merely part-finished', () => {
    const badges = achievementsFor({
      dashboard: dashboard([course({ completedLessons: 5, totalLessons: 6 })]),
      summary: summary(),
      completedLessons: 5,
    });
    expect(idsOf(badges)).not.toContain('course-done');
  });

  it('treats a null best score as ungraded, not as a zero', () => {
    // `null >= 90` is false in JS only by coercion. The explicit null check is
    // what stops a later "simplification" into a truthiness test, which would
    // then also treat a legitimate 0% as "not yet graded".
    const ungraded = achievementsFor({
      dashboard: dashboard(),
      summary: summary({ bestPercent: null }),
      completedLessons: 0,
    });
    expect(idsOf(ungraded)).not.toContain('distinction');

    const zero = achievementsFor({
      dashboard: dashboard(),
      summary: summary({ quizzesTaken: 1, bestPercent: 0 }),
      completedLessons: 0,
    });
    expect(idsOf(zero)).toEqual(['first-exam']);
  });

  it('awards «امتياز» at exactly 90', () => {
    const badges = achievementsFor({
      dashboard: dashboard(),
      summary: summary({ quizzesTaken: 1, passedCount: 1, bestPercent: 90 }),
      completedLessons: 0,
    });
    expect(idsOf(badges)).toContain('distinction');
  });

  it('goes BACKWARDS when the thing that earned it goes away', () => {
    // Deliberate, and the reason nothing here is persisted: a revoked enrolment
    // must not leave a medal behind for a course the student can no longer open.
    const earned = achievementsFor({
      dashboard: dashboard([course({ completedLessons: 6, totalLessons: 6 })]),
      summary: summary(),
      completedLessons: 6,
    });
    expect(idsOf(earned)).toContain('course-done');

    const unenrolled = achievementsFor({
      dashboard: dashboard([]),
      summary: summary(),
      completedLessons: 0,
    });
    expect(idsOf(unenrolled)).not.toContain('course-done');
  });
});

describe('earnedCount', () => {
  it('counts only the earned ones', () => {
    const badges = achievementsFor({
      dashboard: dashboard([course({ completedLessons: 6, totalLessons: 6 })]),
      summary: summary({ quizzesTaken: 2, passedCount: 1, bestPercent: 95 }),
      completedLessons: 12,
    });
    expect(earnedCount(badges)).toBe(6);
  });
});
