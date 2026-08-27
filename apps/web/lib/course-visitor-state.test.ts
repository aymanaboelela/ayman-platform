import { describe, expect, it } from 'vitest';
import { resolveCourseVisitorState } from './course-visitor-state';

describe('resolveCourseVisitorState', () => {
  it('shows nothing extra for an anonymous visitor, even with signals that would otherwise fire', () => {
    // These signals can never legitimately arrive together with
    // `isSignedIn: false` (the caller must not fetch enrollment/payment
    // state for an anonymous visitor), but the branch must still refuse to
    // act on them if it somehow did — it is the load-bearing guard against a
    // caller that skips the "am I signed in" gate.
    const state = resolveCourseVisitorState({
      isSignedIn: false,
      enrollment: { lastLessonId: 'lesson-1' },
      hasPendingSubmission: true,
    });

    expect(state).toEqual({ kind: 'none' });
  });

  it('redirects a signed-in, already-enrolled visitor to their last lesson', () => {
    const state = resolveCourseVisitorState({
      isSignedIn: true,
      enrollment: { lastLessonId: 'lesson-7' },
      hasPendingSubmission: false,
    });

    expect(state).toEqual({ kind: 'enrolled', lessonId: 'lesson-7' });
  });

  it('shows nothing extra for an enrolled visitor who has not opened a lesson yet', () => {
    // No lesson to redirect to — left to the ordinary click flow, which
    // resolves the course's first lesson server-side.
    const state = resolveCourseVisitorState({
      isSignedIn: true,
      enrollment: { lastLessonId: null },
      hasPendingSubmission: true,
    });

    expect(state).toEqual({ kind: 'none' });
  });

  it('shows the pending banner for a signed-in visitor with a pending submission and no enrollment', () => {
    const state = resolveCourseVisitorState({
      isSignedIn: true,
      enrollment: null,
      hasPendingSubmission: true,
    });

    expect(state).toEqual({ kind: 'pending' });
  });

  it('shows nothing extra for a signed-in visitor with neither enrollment nor a pending submission', () => {
    const state = resolveCourseVisitorState({
      isSignedIn: true,
      enrollment: null,
      hasPendingSubmission: false,
    });

    expect(state).toEqual({ kind: 'none' });
  });

  it('prefers enrollment over a pending submission when somehow both are present', () => {
    // Not reachable in practice (an active enrollment means the checkout
    // flow already succeeded, so a payment submission for the same course
    // has nothing pending), but access must win if it ever happens — a
    // student who can already watch the course must never be told to wait
    // for a review.
    const state = resolveCourseVisitorState({
      isSignedIn: true,
      enrollment: { lastLessonId: 'lesson-3' },
      hasPendingSubmission: true,
    });

    expect(state).toEqual({ kind: 'enrolled', lessonId: 'lesson-3' });
  });
});
