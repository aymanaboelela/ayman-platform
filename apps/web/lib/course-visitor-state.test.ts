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
      enrollment: { lastLessonId: 'lesson-1', accessActive: true },
      hasPendingSubmission: true,
    });

    expect(state).toEqual({ kind: 'none' });
  });

  it('redirects a signed-in, already-enrolled visitor to their last lesson', () => {
    const state = resolveCourseVisitorState({
      isSignedIn: true,
      enrollment: { lastLessonId: 'lesson-7', accessActive: true },
      hasPendingSubmission: false,
    });

    expect(state).toEqual({ kind: 'enrolled', lessonId: 'lesson-7' });
  });

  it('shows nothing extra for an enrolled visitor who has not opened a lesson yet', () => {
    // No lesson to redirect to — left to the ordinary click flow, which
    // resolves the course's first lesson server-side.
    const state = resolveCourseVisitorState({
      isSignedIn: true,
      enrollment: { lastLessonId: null, accessActive: true },
      hasPendingSubmission: true,
    });

    expect(state).toEqual({ kind: 'none' });
  });

  it('does NOT redirect a visitor whose subscription lapsed — this page is where they renew', () => {
    // The regression this flag exists for. Nothing writes
    // `EnrollmentStatus.expired`, so a lapsed student still has an `active`
    // enrollment row with a `lastLessonId` on it. Redirecting them into that
    // lesson hits the access gate's 403, which redirects back to this page,
    // which redirected again — a closed loop with the checkout outside it.
    const state = resolveCourseVisitorState({
      isSignedIn: true,
      enrollment: { lastLessonId: 'lesson-7', accessActive: false },
      hasPendingSubmission: false,
    });

    expect(state).toEqual({ kind: 'none' });
  });

  it('shows the pending banner to a lapsed student who has already sent the renewal', () => {
    // Falls through the enrollment branch to the submission one, which is
    // what a renewing student needs to see: «قيد المراجعة», not silence.
    const state = resolveCourseVisitorState({
      isSignedIn: true,
      enrollment: { lastLessonId: 'lesson-7', accessActive: false },
      hasPendingSubmission: true,
    });

    expect(state).toEqual({ kind: 'pending' });
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
      enrollment: { lastLessonId: 'lesson-3', accessActive: true },
      hasPendingSubmission: true,
    });

    expect(state).toEqual({ kind: 'enrolled', lessonId: 'lesson-3' });
  });
});
