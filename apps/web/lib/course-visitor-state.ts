/**
 * What the public course page's progressive-enhancement layer shows a
 * PRICED course's visitor, once it has cheaply learned whether they are
 * signed in and — only for a signed-in visitor — looked up this course's
 * enrollment and payment-submission state.
 *
 * Pure and its own module so `course-subscribe-state.tsx` stays a render
 * (fetch, then hand the results here) and the branching itself — the part
 * that actually decides "does this visitor get redirected, see a pending
 * banner, or see nothing extra" — is testable without mounting a component
 * or faking a fetch.
 *
 * ## Why "signed in but nothing to add" and "not signed in yet" are the
 * SAME output
 *
 * Neither state changes anything about the page: the existing click-driven
 * `CourseStartButton` flow (`2026-08-03-login-gated-content-design.md` §5)
 * is already correct for both — a stranger's click 401s to `/login`, and a
 * signed-in visitor who has never touched this course's checkout just sees
 * the ordinary "subscribe" panel when they press it. Collapsing them into
 * one `none` result is what lets the component render nothing rather than
 * threading a third boolean through every caller.
 */

/** What `GET /api/enrollments` says about THIS course, once filtered to it — or
 *  `null` when no active/completed enrollment for this course was found. */
export interface CourseEnrollmentSignal {
  /** The lesson to resume into. `null` for a student who enrolled (a grant
   *  exists) but has not opened a lesson yet — see the note on `resolve...`
   *  below for why that case is deliberately left to the ordinary click flow
   *  rather than guessed at here. */
  lastLessonId: string | null;
}

export interface ResolveCourseVisitorStateInput {
  /** Cheaply known before any per-course fetch fires — see
   *  `course-subscribe-state.tsx` for how. */
  isSignedIn: boolean;
  /** This course's row from the signed-in visitor's own enrollments, or
   *  `null` when they hold none. Ignored entirely when `isSignedIn` is
   *  `false` — the caller must not fetch it for an anonymous visitor. */
  enrollment: CourseEnrollmentSignal | null;
  /** Whether a `pending` payment submission exists for THIS course —
   *  `PaymentSubmission.status === 'pending'`, filtered client-side the same
   *  way `SubscribePanel`'s own check already does. */
  hasPendingSubmission: boolean;
}

export type CourseVisitorState =
  /** Nothing to add — render the page exactly as it already does. Covers an
   *  anonymous visitor, a signed-in one with no history on this course, and
   *  the one enrolled-but-never-opened-a-lesson edge case above. */
  | { kind: 'none' }
  /** Already has access. The caller redirects straight into `lessonId`,
   *  the same destination `CourseStartButton`'s own 200 branch would send
   *  this visitor to on a click. */
  | { kind: 'enrolled'; lessonId: string }
  /** A payment submission for this course is awaiting review. */
  | { kind: 'pending' };

export function resolveCourseVisitorState({
  isSignedIn,
  enrollment,
  hasPendingSubmission,
}: ResolveCourseVisitorStateInput): CourseVisitorState {
  if (!isSignedIn) return { kind: 'none' };

  if (enrollment) {
    // Enrolled means a grant already resolved `allowed: true` at some point
    // — access exists regardless of `lastLessonId`. Without a lesson to name
    // yet (first enrollment, never opened), there is nothing for a REDIRECT
    // to point at; the ordinary "نبدأ الكورس" click already resolves this
    // correctly (it re-enrolls, idempotently, and computes the course's
    // first lesson as the fallback `resumeLessonId` — see
    // `EntitlementService.enroll`), so that rare case is left to it rather
    // than duplicated here.
    return enrollment.lastLessonId
      ? { kind: 'enrolled', lessonId: enrollment.lastLessonId }
      : { kind: 'none' };
  }

  if (hasPendingSubmission) return { kind: 'pending' };

  return { kind: 'none' };
}
