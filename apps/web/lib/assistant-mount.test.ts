import { describe, expect, it } from 'vitest';
import { shouldMountAssistant } from './assistant-mount';

describe('shouldMountAssistant', () => {
  it.each([
    ['/', 'the landing page'],
    ['/courses', 'the catalog'],
    ['/courses/cs-3', 'a course page'],
    ['/dashboard', 'the student dashboard'],
    ['/library/cs-3', 'a course in the library'],
    ['/quizzes/lesson-1', 'a quiz overview — not the attempt itself'],
    ['/quizzes/lesson-1/attempt/a1/review', 'a graded paper being reviewed'],
    ['/profile', 'the profile screen'],
    ['/login', 'the login screen'],
  ])('mounts on %s (%s)', (pathname) => {
    expect(shouldMountAssistant(pathname)).toBe(true);
  });

  it('never mounts inside a graded attempt', () => {
    /*
     * The load-bearing case. A support channel open beside a timed exam lets a
     * student ask about the question in front of them — an integrity hole, not
     * a styling preference.
     */
    expect(shouldMountAssistant('/quizzes/lesson-1/attempt/attempt-1')).toBe(false);
  });

  it('mounts on the REVIEW of that same attempt', () => {
    // Read-only, already graded, and the likeliest moment a student wants to
    // ask something. Suppressing the whole `/quizzes` subtree would have taken
    // this with it.
    expect(shouldMountAssistant('/quizzes/lesson-1/attempt/attempt-1/review')).toBe(true);
  });

  it.each(['/admin', '/admin/inbox', '/admin/courses/abc', '/onboarding'])(
    'never mounts on %s',
    (pathname) => {
      expect(shouldMountAssistant(pathname)).toBe(false);
    },
  );

  it('matches prefixes on segment boundaries, not on characters', () => {
    /*
     * `startsWith('/admin')` would suppress these too, and the symptom would be
     * a page that silently never shows the widget — with nothing to grep for
     * and no error anywhere.
     */
    expect(shouldMountAssistant('/administration')).toBe(true);
    expect(shouldMountAssistant('/admin-guide')).toBe(true);
    expect(shouldMountAssistant('/onboarding-help')).toBe(true);
  });
});
