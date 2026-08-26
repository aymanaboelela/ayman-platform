import { describe, expect, it } from 'vitest';
import type { CatalogCourse, Dashboard, EnrolledCourse, RecentScore } from '@ayman/contracts';
import {
  firstName,
  hasOutstandingSteps,
  recommendedCourses,
  startHereSteps,
  summarise,
} from './dashboard-view';
import type { LibraryIdentity } from './library';

function course(overrides: Partial<EnrolledCourse> = {}): EnrolledCourse {
  return {
    id: 'c1',
    slug: 'python-1',
    title: 'أساسيات بايثون',
    coverKey: null,
    subjectNameAr: 'برمجة',
    // Published unless a case says otherwise — a course the instructor has
    // taken down is the exception, and `EnrolledCourseSchema.published` says
    // why it is on the wire at all.
    published: true,
    progressPercent: 0,
    completedLessons: 0,
    totalLessons: 10,
    lastLessonId: null,
    ...overrides,
  };
}

function score(overrides: Partial<RecentScore> = {}): RecentScore {
  return {
    attemptId: 'a1',
    quizTitle: 'اختبار ١',
    scorePercent: 80,
    ...overrides,
  } as RecentScore;
}

function dashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return { continueWatching: null, enrolledCourses: [], recentScores: [], ...overrides };
}

describe('summarise', () => {
  it('sums lessons across every course', () => {
    const result = summarise(
      dashboard({
        enrolledCourses: [
          course({ id: 'c1', completedLessons: 2, totalLessons: 40 }),
          course({ id: 'c2', completedLessons: 2, totalLessons: 2 }),
        ],
      }),
    );

    expect(result.completedLessons).toBe(4);
    expect(result.totalLessons).toBe(42);
  });

  it('computes overall progress over the TOTAL, not as a mean of percentages', () => {
    // 2/40 and 2/2 average to 52% if you mean the percentages, which lets a
    // two-lesson course drag the headline number around. The honest figure is
    // 4/42 = 10%.
    const result = summarise(
      dashboard({
        enrolledCourses: [
          course({ id: 'c1', completedLessons: 2, totalLessons: 40, progressPercent: 5 }),
          course({ id: 'c2', completedLessons: 2, totalLessons: 2, progressPercent: 100 }),
        ],
      }),
    );

    expect(result.overallPercent).toBe(10);
  });

  it('does not divide by zero when no course has published lessons', () => {
    const result = summarise(
      dashboard({ enrolledCourses: [course({ completedLessons: 0, totalLessons: 0 })] }),
    );

    expect(result.overallPercent).toBe(0);
  });

  it('returns a null average — not 0 — when nothing has been graded', () => {
    // 0 reads as "you averaged zero". Null is what makes the tile render
    // "لسه" instead of telling a new student they failed.
    expect(summarise(dashboard()).averageScore).toBeNull();
  });

  it('averages the recent scores it was given', () => {
    const result = summarise(
      dashboard({
        recentScores: [
          score({ attemptId: 'a1', scorePercent: 90 }),
          score({ attemptId: 'a2', scorePercent: 70 }),
        ],
      }),
    );

    expect(result.averageScore).toBe(80);
  });
});

describe('firstName', () => {
  it('takes the first word only', () => {
    expect(firstName('أحمد محمود إبراهيم')).toBe('أحمد');
  });

  it('ignores surrounding whitespace', () => {
    expect(firstName('  ايمن  ')).toBe('ايمن');
  });

  it('returns null for an empty or missing name, so the caller can greet generically', () => {
    expect(firstName('')).toBeNull();
    expect(firstName('   ')).toBeNull();
    expect(firstName(undefined)).toBeNull();
  });
});

describe('startHereSteps', () => {
  it('marks nothing done for a brand-new student', () => {
    const steps = startHereSteps(dashboard());
    expect(steps.map((s) => s.done)).toEqual([false, false, false]);
    expect(hasOutstandingSteps(steps)).toBe(true);
  });

  it('ticks the enrol step as soon as there is a course', () => {
    const steps = startHereSteps(dashboard({ enrolledCourses: [course()] }));
    expect(steps[0]?.done).toBe(true);
    expect(steps[1]?.done).toBe(false);
  });

  it('ticks the lesson step from lastLessonId, not from completion', () => {
    // The step asks whether they have STARTED watching. A lesson only counts
    // as completed at 95% position AND 70% watch time, so testing
    // `completedLessons > 0` would leave a student who is halfway through
    // their first video still being told to open their first lesson.
    const steps = startHereSteps(
      dashboard({ enrolledCourses: [course({ lastLessonId: 'l1', completedLessons: 0 })] }),
    );

    expect(steps[1]?.done).toBe(true);
  });

  it('ticks the quiz step from a graded result', () => {
    const steps = startHereSteps(dashboard({ recentScores: [score()] }));
    expect(steps[2]?.done).toBe(true);
  });

  it('reports nothing outstanding once all three are done', () => {
    const steps = startHereSteps(
      dashboard({
        enrolledCourses: [course({ lastLessonId: 'l1' })],
        recentScores: [score()],
      }),
    );

    expect(hasOutstandingSteps(steps)).toBe(false);
  });

  it('points the lesson step at the live resume target when there is one', () => {
    const steps = startHereSteps(
      dashboard({
        enrolledCourses: [course({ lastLessonId: 'l1' })],
        continueWatching: {
          courseId: 'c1',
          courseSlug: 'python-1',
          courseTitle: 'أساسيات بايثون',
          lessonId: 'l1',
          lessonTitle: 'المتغيرات',
          lessonKind: 'video',
          progressPercent: 20,
          remainingSeconds: 300,
        },
      }),
    );

    expect(steps[1]?.href).toBe('/courses/python-1/lessons/l1');
  });

  it('falls back to the IN-SHELL course page when there is no resume target', () => {
    // The course page picks its own first lesson, so this is never a dead
    // link — which is the whole point of not synthesising a lesson id here.
    //
    // ⚠️ This assertion used to read `/courses/python-1`, and it was WRONG in
    // exactly the way the test below is right: that is the public marketing
    // page, so «افتح الدرس» on the dashboard threw a signed-in student out of
    // their shell onto a sales page with a lock badge on it. The test passed
    // the whole time, because it asserted the behaviour rather than the
    // intent, and the intent was already written down three lines further
    // down this file.
    const steps = startHereSteps(dashboard({ enrolledCourses: [course()] }));
    expect(steps[1]?.href).toBe('/library/python-1');
    expect(steps[1]?.href).not.toBe('/courses/python-1');
  });

  it('falls back to the IN-SHELL library when there is no course at all', () => {
    // `/library`, not the public `/courses`. This link is clicked from the
    // dashboard by someone who is already signed in, and sending them to the
    // marketing catalog drops them out of the shell they are standing in.
    expect(startHereSteps(dashboard())[1]?.href).toBe('/library');
  });
});

/**
 * The prerequisite chain — what makes a step that is not its turn yet ANSWER
 * a press instead of ignoring it.
 *
 * Steps 2 and 3 used to render no control at all, so pressing them did nothing
 * whatsoever on the first screen of the product. These cases pin the data that
 * replaced that: every outstanding step is either takeable now (`blockedBy`
 * null) or names the thing that comes first and where to go for it.
 */
describe('startHereSteps — the prerequisite each step reports', () => {
  it('never blocks the first step: choosing a course is always available', () => {
    for (const state of [
      dashboard(),
      dashboard({ enrolledCourses: [course()] }),
      dashboard({ enrolledCourses: [course({ lastLessonId: 'l1' })] }),
    ]) {
      expect(startHereSteps(state)[0]?.blockedBy).toBeNull();
    }
  });

  it('sends both later steps to the catalogue for a brand-new student', () => {
    const steps = startHereSteps(dashboard());
    // Both point at the catalogue, because with no course at all that is the
    // earliest unmet prerequisite — not "open a lesson", which there is no
    // lesson to open for.
    expect(steps[1]?.blockedBy?.href).toBe('/library');
    expect(steps[2]?.blockedBy?.href).toBe('/library');
  });

  /**
   * Destination and REASON are chosen separately. Both later steps go to the
   * catalogue above; neither may borrow the other's sentence to explain why —
   * «عشان تفتح درس…» under a row titled «حل أول اختبار» answers a question
   * nobody asked.
   */
  it('gives each blocked step its own reason, not the one above it', () => {
    const steps = startHereSteps(dashboard());
    expect(steps[1]?.blockedBy?.reason).not.toBe(steps[2]?.blockedBy?.reason);
  });

  it('unblocks the lesson step the moment a course exists', () => {
    const steps = startHereSteps(dashboard({ enrolledCourses: [course()] }));
    expect(steps[1]?.blockedBy).toBeNull();
  });

  /**
   * The case the naive "block on the step above being done" rule gets wrong.
   * A student who is enrolled but has opened nothing must be sent to the
   * LESSON, not back to the catalogue they have already used.
   */
  it('moves the quiz step’s blocker from the catalogue to the lesson once enrolled', () => {
    const steps = startHereSteps(dashboard({ enrolledCourses: [course()] }));
    const blocker = steps[2]?.blockedBy;
    expect(blocker).not.toBeNull();
    expect(blocker?.href).not.toBe('/library');
    // …and it is the exact href the lesson step itself offers, so «افتح الدرس»
    // means one thing wherever it is pressed.
    expect(blocker?.href).toBe(steps[1]?.href);
    expect(blocker?.cta).toBe(steps[1]?.cta);
  });

  it('unblocks every step once a lesson has been opened', () => {
    const steps = startHereSteps(
      dashboard({ enrolledCourses: [course({ lastLessonId: 'l1' })] }),
    );
    expect(steps.map((s) => s.blockedBy)).toEqual([null, null, null]);
  });

  /**
   * The invariant behind the whole change: on any dashboard state, an
   * outstanding step is either takeable or explains itself. A step that is
   * neither is the dead row this replaced.
   */
  it('leaves no outstanding step without either a destination or a reason', () => {
    for (const state of [
      dashboard(),
      dashboard({ enrolledCourses: [course()] }),
      dashboard({ enrolledCourses: [course({ lastLessonId: 'l1' })] }),
      dashboard({ enrolledCourses: [course()], recentScores: [score()] }),
    ]) {
      for (const step of startHereSteps(state).filter((s) => !s.done)) {
        const answers = step.blockedBy !== null || step.href.length > 0;
        expect(answers).toBe(true);
      }
    }
  });
});

function catalogCourse(over: Partial<CatalogCourse> & { id: string }): CatalogCourse {
  return {
    slug: over.id,
    title: over.id,
    subtitle: null,
    systemSlug: 'bacc',
    systemNameAr: 'البكالوريا',
    year: 2,
    trackLabelAr: null,
    subjectNameAr: 'برمجة',
    forGeneral: true,
    forLanguages: true,
    coverKey: null,
    lessonCount: 10,
    totalSeconds: 3600,
    emphasis: 'optional',
    emphasisNote: null,
    monthlyPriceCents: null,
    quarterlyPriceCents: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as CatalogCourse;
}

const identity: LibraryIdentity = {
  year: 2,
  yearLabelAr: 'الصف الثاني بكالوريا',
  trackLabelAr: 'علمي',
  schoolStream: null,
  schoolStreamLabelAr: null,
};

describe('recommendedCourses', () => {
  it('is empty with no identity — no year chosen yet is not "show everything"', () => {
    const result = recommendedCourses({
      courses: [catalogCourse({ id: 'c1' })],
      identity: null,
      enrolledCourseIds: new Set(),
    });
    expect(result).toEqual([]);
  });

  it('drops a course the student is already enrolled in', () => {
    const result = recommendedCourses({
      courses: [catalogCourse({ id: 'c1' }), catalogCourse({ id: 'c2' })],
      identity,
      enrolledCourseIds: new Set(['c1']),
    });
    expect(result.map((c) => c.id)).toEqual(['c2']);
  });

  it('drops a course outside the student’s (year, track) cell', () => {
    const result = recommendedCourses({
      courses: [
        catalogCourse({ id: 'wrong-year', year: 3 }),
        catalogCourse({ id: 'wrong-track', trackLabelAr: 'لغات' }),
        catalogCourse({ id: 'untracked', trackLabelAr: null }),
        catalogCourse({ id: 'own-track', trackLabelAr: 'علمي' }),
      ],
      identity,
      enrolledCourseIds: new Set(),
    });
    expect(result.map((c) => c.id).sort()).toEqual(['own-track', 'untracked']);
  });

  /**
   * The bug this closes: a عام student with `schoolStream: null` — the
   * question never answered, not the question answered "عام" — was
   * recommended a لغات-only course, because `isOwnCourse`'s own stream rule
   * (correctly, for `/library`) treats an unset stream as "matches
   * everything". A NUDGE claiming to know what this student should do next
   * may not guess wrong, so with the stream unset only a course open to
   * BOTH schools is safe to recommend here.
   */
  it('recommends only a both-schools course when the student’s own stream is unset', () => {
    // `identity.schoolStream` is already `null` in this file's fixture — the
    // unanswered-question state, not "answered عام".
    const result = recommendedCourses({
      courses: [
        catalogCourse({ id: 'languages-only', forGeneral: false, forLanguages: true }),
        catalogCourse({ id: 'general-only', forGeneral: true, forLanguages: false }),
        catalogCourse({ id: 'both', forGeneral: true, forLanguages: true }),
      ],
      identity,
      enrolledCourseIds: new Set(),
    });
    expect(result.map((c) => c.id)).toEqual(['both']);
  });

  it('caps at the given limit', () => {
    const result = recommendedCourses({
      courses: [catalogCourse({ id: 'c1' }), catalogCourse({ id: 'c2' }), catalogCourse({ id: 'c3' })],
      identity,
      enrolledCourseIds: new Set(),
      limit: 2,
    });
    expect(result).toHaveLength(2);
  });

  it('maps to an unenrolled LibraryCourse — no progress, no resume target', () => {
    const [result] = recommendedCourses({
      courses: [catalogCourse({ id: 'c1' })],
      identity,
      enrolledCourseIds: new Set(),
    });
    expect(result).toMatchObject({ progressPercent: null, clearedLessons: 0, nextLessonId: null });
  });
});
