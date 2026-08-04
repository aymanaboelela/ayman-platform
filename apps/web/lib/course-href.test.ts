import { describe, expect, it } from 'vitest';
import { courseHref, enrolledCourseHref } from './course-href';

/**
 * These tests exist because the bug they pin was invisible in every unit test
 * that existed: both call sites produced a well-formed URL to a page that
 * rendered fine. It was the WRONG page, and nothing but opening it could say so.
 *
 * So the assertions here are about which of two real routes a student lands on,
 * and the negative assertion is the one that matters.
 */
describe('enrolledCourseHref', () => {
  it('resumes at the last lesson when the API knows of one', () => {
    expect(enrolledCourseHref({ slug: 'python-basics', lastLessonId: 'les-7' })).toBe(
      '/courses/python-basics/lessons/les-7',
    );
  });

  it('falls back to the IN-SHELL course page, never the public one', () => {
    // The regression, stated as an assertion: a student who has enrolled but
    // not opened a lesson yet used to be sent to `/courses/python-basics` —
    // the marketing page, outside the student shell, showing a lock badge over
    // a course they are already enrolled in.
    const href = enrolledCourseHref({ slug: 'python-basics', lastLessonId: null });
    expect(href).toBe('/library/python-basics');
    expect(href).not.toBe('/courses/python-basics');
  });

  it('treats a missing lastLessonId the same as an explicit null', () => {
    expect(enrolledCourseHref({ slug: 'python-basics' })).toBe('/library/python-basics');
  });

  it('treats an empty-string lastLessonId as "no last lesson"', () => {
    // `''` is falsy, so it takes the fallback branch rather than producing
    // `/courses/python-basics/lessons/` — a URL that 404s.
    expect(enrolledCourseHref({ slug: 'python-basics', lastLessonId: '' })).toBe(
      '/library/python-basics',
    );
  });

  it('encodes a slug that would otherwise change the path shape', () => {
    expect(enrolledCourseHref({ slug: 'a/b', lastLessonId: null })).toBe('/library/a%2Fb');
    expect(enrolledCourseHref({ slug: 'ok', lastLessonId: 'a/b' })).toBe(
      '/courses/ok/lessons/a%2Fb',
    );
  });

  it('round-trips an Arabic slug', () => {
    expect(enrolledCourseHref({ slug: 'برمجة' })).toBe(
      `/library/${encodeURIComponent('برمجة')}`,
    );
  });
});

describe('courseHref', () => {
  it('always points inside the shell', () => {
    expect(courseHref('python-basics')).toBe('/library/python-basics');
  });
});
