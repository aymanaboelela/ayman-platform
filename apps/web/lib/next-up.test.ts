import { describe, expect, it } from 'vitest';
import type { Dashboard, EnrolledCourse, PendingExam } from '@ayman/contracts/progress';
import { MAX_NEXT_UP, finishedCourseTitles, lessonsLeftLabel, nextUp } from './next-up';

/**
 * The fixtures mirror `achievements.test.ts`'s: one builder per DTO with every
 * field spelled out, so a field added to `EnrolledCourseSchema` fails to
 * compile here rather than silently defaulting to `undefined` in a test that
 * then passes for the wrong reason.
 */
function course(overrides: Partial<EnrolledCourse> = {}): EnrolledCourse {
  return {
    id: 'c1',
    slug: 'c1',
    title: 'كورس',
    coverKey: null,
    subjectNameAr: 'الفيزياء',
    contentComplete: false,
    published: true,
    progressPercent: 0,
    completedLessons: 0,
    totalLessons: 10,
    lastLessonId: null,
    subscriptionValidUntil: null,
    comingSoonNote: null,
    scheduleNote: null,
    bookTitle: null,
    bookPriceCents: null,
    ...overrides,
  };
}

function exam(overrides: Partial<PendingExam> = {}): PendingExam {
  return {
    courseId: 'c1',
    courseSlug: 'c1',
    courseTitle: 'كورس',
    lessonId: 'l-exam',
    lessonTitle: 'الامتحان النهائي',
    ...overrides,
  };
}

function dashboard(
  courses: EnrolledCourse[] = [],
  pendingExams: PendingExam[] = [],
): Dashboard {
  return {
    continueWatching: null,
    enrolledCourses: courses,
    recentScores: [],
    totalWatchedSeconds: 0,
    pendingExams,
  };
}

const idsOf = (items: ReturnType<typeof nextUp>) => items.map((item) => item.id);

describe('nextUp — ordering', () => {
  it('puts the course closest to done first, counting lessons and not percent', () => {
    /*
     * The case the ordering rule was written for. `big` is further along as a
     * PERCENTAGE (90% of forty) and `small` is nearer to actually being over
     * (one lesson of two). One sitting closes `small`; four close `big`.
     */
    const big = course({ id: 'big', totalLessons: 40, completedLessons: 36, progressPercent: 90 });
    const small = course({ id: 'small', totalLessons: 2, completedLessons: 1, progressPercent: 50 });

    expect(idsOf(nextUp(dashboard([big, small])))).toEqual(['small', 'big']);
  });

  it('breaks a tie on how much is already behind the student', () => {
    const behind = course({
      id: 'behind',
      totalLessons: 10,
      completedLessons: 7,
      progressPercent: 70,
    });
    const ahead = course({
      id: 'ahead',
      totalLessons: 20,
      completedLessons: 17,
      progressPercent: 85,
    });

    // Three left each — the one with more of it done sorts first.
    expect(idsOf(nextUp(dashboard([behind, ahead])))).toEqual(['ahead', 'behind']);
  });

  it('ranks a ready exam alongside a single outstanding lesson, ahead of everything longer', () => {
    const long = course({ id: 'long', totalLessons: 20, completedLessons: 15, progressPercent: 75 });
    const done = course({
      id: 'done',
      totalLessons: 8,
      completedLessons: 8,
      progressPercent: 100,
    });

    const items = nextUp(dashboard([long, done], [exam({ courseId: 'done' })]));

    expect(idsOf(items)).toEqual(['done', 'long']);
    expect(items[0]?.kind).toBe('exam');
  });
});

describe('nextUp — what earns a row', () => {
  it('caps the list at three however many courses are outstanding', () => {
    const courses = Array.from({ length: 11 }, (_, i) =>
      course({ id: `c${i}`, slug: `c${i}`, totalLessons: 10, completedLessons: i }),
    );

    expect(nextUp(dashboard(courses))).toHaveLength(MAX_NEXT_UP);
  });

  it('is empty at 100% — every course finished and no exam waiting', () => {
    const finished = course({
      id: 'fin',
      totalLessons: 12,
      completedLessons: 12,
      progressPercent: 100,
    });

    expect(nextUp(dashboard([finished, course({ id: 'fin2', totalLessons: 3, completedLessons: 3 })]))).toEqual([]);
  });

  it('is empty for a student with nothing enrolled', () => {
    expect(nextUp(dashboard())).toEqual([]);
  });

  it('drops a course the instructor has taken down — the student cannot act on it', () => {
    const closed = course({ id: 'closed', published: false, completedLessons: 9, totalLessons: 10 });
    const open = course({ id: 'open', completedLessons: 2, totalLessons: 10 });

    expect(idsOf(nextUp(dashboard([closed, open])))).toEqual(['open']);
  });

  it('drops an exam whose course is closed', () => {
    const closed = course({ id: 'closed', published: false, completedLessons: 8, totalLessons: 8 });

    expect(nextUp(dashboard([closed], [exam({ courseId: 'closed' })]))).toEqual([]);
  });

  it('drops a course with nothing published yet', () => {
    const comingSoon = course({ id: 'soon', totalLessons: 0, completedLessons: 0 });

    expect(nextUp(dashboard([comingSoon]))).toEqual([]);
  });

  it('never lists the same course twice — the exam replaces its lesson count', () => {
    // The exam lesson itself is the one uncleared lesson on the course.
    const nearlyDone = course({
      id: 'c1',
      totalLessons: 9,
      completedLessons: 8,
      progressPercent: 89,
    });

    const items = nextUp(dashboard([nearlyDone], [exam({ courseId: 'c1' })]));

    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('exam');
  });
});

describe('nextUp — every row is a real destination', () => {
  it('resumes at the last opened lesson when there is one', () => {
    const started = course({
      id: 'c1',
      slug: 'physics-1',
      lastLessonId: 'l7',
      completedLessons: 3,
      totalLessons: 10,
    });

    expect(nextUp(dashboard([started]))[0]?.href).toBe('/courses/physics-1/lessons/l7');
  });

  it('sends a student who has opened nothing to the in-shell course page, never the sales page', () => {
    const fresh = course({ id: 'c1', slug: 'physics-1', lastLessonId: null });

    expect(nextUp(dashboard([fresh]))[0]?.href).toBe('/library/physics-1');
  });

  it('sends the exam row into the quiz runner', () => {
    const ready = course({ id: 'c1', totalLessons: 5, completedLessons: 5 });

    expect(nextUp(dashboard([ready], [exam({ lessonId: 'l-exam' })]))[0]?.href).toBe(
      '/quizzes/l-exam',
    );
  });

  it('names the course on every row', () => {
    const items = nextUp(
      dashboard(
        [
          course({ id: 'a', title: 'الفيزياء', completedLessons: 1, totalLessons: 4 }),
          course({ id: 'b', title: 'الكيمياء', completedLessons: 8, totalLessons: 8 }),
        ],
        [exam({ courseId: 'b', courseTitle: 'الكيمياء' })],
      ),
    );

    expect(items.map((item) => item.courseTitle)).toEqual(['الكيمياء', 'الفيزياء']);
  });
});

describe('lessonsLeftLabel — a count a person would say out loud', () => {
  it('reads as a sentence at one and two', () => {
    expect(lessonsLeftLabel(1)).toBe('فاضلك درس واحد');
    expect(lessonsLeftLabel(2)).toBe('فاضلك درسين');
  });

  it('switches form at eleven, as Arabic does', () => {
    expect(lessonsLeftLabel(3)).toBe('فاضلك 3 دروس');
    expect(lessonsLeftLabel(10)).toBe('فاضلك 10 دروس');
    expect(lessonsLeftLabel(11)).toBe('فاضلك 11 درس');
  });
});

describe('finishedCourseTitles', () => {
  it('names only courses with published lessons that are all cleared', () => {
    const titles = finishedCourseTitles(
      dashboard([
        course({ id: 'a', title: 'الفيزياء', totalLessons: 4, completedLessons: 4 }),
        course({ id: 'b', title: 'الكيمياء', totalLessons: 4, completedLessons: 2 }),
        // Nothing published yet — 0 >= 0 is true and would otherwise qualify.
        course({ id: 'c', title: 'الأحياء', totalLessons: 0, completedLessons: 0 }),
      ]),
    );

    expect(titles).toEqual(['الفيزياء']);
  });
});
