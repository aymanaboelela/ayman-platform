import { describe, expect, it } from 'vitest';
import type { Dashboard, EnrolledCourse, RecentScore } from '@ayman/contracts';
import {
  firstName,
  hasOutstandingSteps,
  startHereSteps,
  summarise,
} from './dashboard-view';

function course(overrides: Partial<EnrolledCourse> = {}): EnrolledCourse {
  return {
    id: 'c1',
    slug: 'python-1',
    title: 'أساسيات بايثون',
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

  it('falls back to the course page when there is no resume target', () => {
    // The course page picks its own first lesson, so this is never a dead
    // link — which is the whole point of not synthesising a lesson id here.
    const steps = startHereSteps(dashboard({ enrolledCourses: [course()] }));
    expect(steps[1]?.href).toBe('/courses/python-1');
  });

  it('falls back to the catalog when there is no course at all', () => {
    expect(startHereSteps(dashboard())[1]?.href).toBe('/courses');
  });
});
