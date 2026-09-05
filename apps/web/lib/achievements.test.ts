import { describe, expect, it } from 'vitest';
import type { Dashboard, EnrolledCourse, QuizHistorySummary } from '@ayman/contracts';
import { achievementsFor, earnedCount, highestTier, tierName } from './achievements';

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

/**
 * The tiers are a CLAIM about how hard each marker is, and the claim is the
 * thing worth pinning down: the values below are the argument written out in
 * `achievements.ts`, restated as an assertion so that re-pricing a marker is a
 * deliberate act with a red test in front of it rather than a one-word edit.
 */
describe('tiers', () => {
  const TIERS: Record<string, 'bronze' | 'silver' | 'gold'> = {
    'first-lesson': 'bronze',
    'ten-lessons': 'silver',
    // Bronze, and NOT silver: this is awarded for sitting an exam, including
    // one that was failed. Attendance is bronze; attainment starts at silver.
    'first-exam': 'bronze',
    'first-pass': 'silver',
    'course-done': 'gold',
    'distinction': 'gold',
  };

  it('prices every marker by what it costs', () => {
    const badges = achievementsFor({
      dashboard: dashboard(),
      summary: summary(),
      completedLessons: 0,
    });
    expect(Object.fromEntries(badges.map((badge) => [badge.id, badge.tier]))).toEqual(TIERS);
  });

  it('gives the same tier to a finished student as to a brand-new one', () => {
    // The whole point of rendering an unearned gold marker is to say that it IS
    // gold before you have it. If `tier` ever started reading `earned` it would
    // be a second spelling of `earned` and the unearned half of the strip would
    // go back to six identical circles.
    const empty = achievementsFor({
      dashboard: dashboard(),
      summary: summary(),
      completedLessons: 0,
    });
    const full = achievementsFor({
      dashboard: dashboard([course({ completedLessons: 6, totalLessons: 6 })]),
      summary: summary({ quizzesTaken: 4, attemptsTotal: 5, passedCount: 3, bestPercent: 97 }),
      completedLessons: 40,
    });
    expect(earnedCount(empty)).toBe(0);
    expect(earnedCount(full)).toBe(6);
    expect(full.map((badge) => badge.tier)).toEqual(empty.map((badge) => badge.tier));
  });

  it('spans all three tiers, so the strip has something to rank', () => {
    const badges = achievementsFor({
      dashboard: dashboard(),
      summary: summary(),
      completedLessons: 0,
    });
    expect(new Set(badges.map((badge) => badge.tier))).toEqual(
      new Set(['bronze', 'silver', 'gold']),
    );
  });
});

describe('highestTier', () => {
  it('is null when nothing has been earned', () => {
    // Not 'bronze'. A new student holds no badge at all, and the stat tile that
    // colours itself by this would otherwise paint bronze for somebody who has
    // not earned bronze.
    const badges = achievementsFor({
      dashboard: dashboard(),
      summary: summary(),
      completedLessons: 0,
    });
    expect(highestTier(badges)).toBeNull();
  });

  it('is bronze on the first lesson alone', () => {
    const badges = achievementsFor({
      dashboard: dashboard(),
      summary: summary(),
      completedLessons: 1,
    });
    expect(highestTier(badges)).toBe('bronze');
  });

  it('reports the BEST tier held, not the last or the most common', () => {
    // Two bronze and one silver: ten lessons carries the first-lesson marker
    // with it, so bronze outnumbers silver two to one and silver still wins.
    const badges = achievementsFor({
      dashboard: dashboard(),
      summary: summary({ quizzesTaken: 1, attemptsTotal: 1 }),
      completedLessons: 10,
    });
    expect(idsOf(badges)).toEqual(['first-lesson', 'ten-lessons', 'first-exam']);
    expect(highestTier(badges)).toBe('silver');
  });

  it('reaches gold on a distinction alone, with no cheaper badge under it', () => {
    // `distinction` is the one gold a student can hold without the ladder
    // beneath it — 90% on a first exam earns first-exam, first-pass and this.
    // Ordering by rank rather than by position in the array is what makes it
    // gold; a "last earned wins" implementation would answer silver.
    const badges = achievementsFor({
      dashboard: dashboard(),
      summary: summary({ quizzesTaken: 1, attemptsTotal: 1, passedCount: 1, bestPercent: 95 }),
      completedLessons: 0,
    });
    expect(idsOf(badges)).toEqual(['first-exam', 'first-pass', 'distinction']);
    expect(highestTier(badges)).toBe('gold');
  });

  it('ignores unearned gold markers', () => {
    // Every strip contains two gold markers from day one. Ranking the ones a
    // student does not hold would report every account as gold.
    const badges = achievementsFor({
      dashboard: dashboard([course({ completedLessons: 1, totalLessons: 6 })]),
      summary: summary(),
      completedLessons: 1,
    });
    expect(badges.some((badge) => badge.tier === 'gold' && !badge.earned)).toBe(true);
    expect(highestTier(badges)).toBe('bronze');
  });

  it('goes back down when the gold marker stops being true', () => {
    // Same "a marker can go BACKWARDS" rule the rest of this file documents,
    // applied to the tile's colour: unenrol from the finished course and the
    // tile must stop claiming gold. Ten lessons rather than six, so the drop
    // lands on silver and proves the tile RE-RANKS rather than merely
    // forgetting the gold and falling all the way to the bottom.
    const enrolled = achievementsFor({
      dashboard: dashboard([course({ completedLessons: 10, totalLessons: 10 })]),
      summary: summary(),
      completedLessons: 10,
    });
    expect(highestTier(enrolled)).toBe('gold');

    const revoked = achievementsFor({
      dashboard: dashboard([]),
      summary: summary(),
      completedLessons: 10,
    });
    expect(highestTier(revoked)).toBe('silver');
  });
});

describe('tierName', () => {
  it('names each tier, so a screen reader hears the weight and not just a colour', () => {
    expect(tierName('bronze')).toBe('برونزية');
    expect(tierName('silver')).toBe('فضية');
    expect(tierName('gold')).toBe('ذهبية');
  });
});
