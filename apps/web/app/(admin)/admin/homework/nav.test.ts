import { describe, expect, it } from 'vitest';
import { homeworkBackHref, homeworkListHref } from './nav';

const LESSON = '0190cccc-0000-7000-8000-000000000003';

describe('homeworkBackHref', () => {
  it('returns to the lecture the submission belongs to, on the same tab', () => {
    // The bug: «رجوع» used to land on the default view, not on what he had open.
    expect(homeworkBackHref('all', LESSON)).toBe(`/admin/homework?lessonId=${LESSON}&filter=all`);
    expect(homeworkBackHref('accepted', LESSON)).toBe(`/admin/homework?lessonId=${LESSON}&filter=accepted`);
    expect(homeworkBackHref('needs_work', LESSON)).toBe(`/admin/homework?lessonId=${LESSON}&filter=needs_work`);
    expect(homeworkBackHref('pending', LESSON)).toBe(`/admin/homework?lessonId=${LESSON}&filter=pending`);
  });

  it('keeps the lecture and drops a missing or bogus filter', () => {
    expect(homeworkBackHref(undefined, LESSON)).toBe(`/admin/homework?lessonId=${LESSON}`);
    expect(homeworkBackHref('not-a-real-filter', LESSON)).toBe(`/admin/homework?lessonId=${LESSON}`);
  });

  it('falls back to the overview without a real lecture', () => {
    expect(homeworkBackHref('all')).toBe('/admin/homework');
    expect(homeworkBackHref(undefined)).toBe('/admin/homework');
    // A hand-edited URL lands on the overview, never on a 400.
    expect(homeworkBackHref('pending', 'nope')).toBe('/admin/homework');
  });
});

describe('homeworkListHref', () => {
  it('builds a lecture tab link', () => {
    expect(homeworkListHref(LESSON, 'pending')).toBe(`/admin/homework?lessonId=${LESSON}&filter=pending`);
    expect(homeworkListHref(LESSON)).toBe(`/admin/homework?lessonId=${LESSON}`);
  });
});
