/**
 * Where المساعد does NOT appear.
 *
 * The widget is mounted once, at the root, so it reaches every route group —
 * and that makes "everywhere" the default rather than a decision. These are
 * the three places where showing it is actively wrong, each for its own
 * reason, kept in one predicate with one test table so the rule cannot drift
 * between the mount and whatever asks next.
 */

/**
 * Route prefixes the launcher is suppressed on.
 *
 * ⚠️ This predicate is the SECOND line, not the first. The widget is mounted
 * per route group — `(site)`, `(app)`, `(auth)`, never `(admin)` and never the
 * root — because a root mount also rendered on `not-found.tsx`, which is the
 * same tree a student sees when `(admin)/layout.tsx` calls `notFound()` on
 * them. `usePathname()` was then the only difference between "forbidden" and
 * "does not exist", and `admin-publish-course.e2e.ts` exists to assert those
 * two are byte-identical. See any group layout for the full note.
 */
const SUPPRESSED = [
  /*
   * The instructor's own dashboard. Unreachable now that `(admin)` carries no
   * mount, and kept anyway: it is a true statement about where the widget
   * belongs, and it is what stops a future mount there from being silent.
   */
  '/admin',
  /*
   * A student mid-onboarding is in a flow they must finish. A floating panel
   * over it competes with the only thing that screen wants them to do.
   */
  '/onboarding',
] as const;

/**
 * A GRADED ATTEMPT in progress: `/quizzes/:lessonId/attempt/:attemptId`.
 *
 * This one is not a matter of taste. A support channel open beside a timed
 * exam is a route to asking about a question the student is currently looking
 * at — an integrity hole, not a distraction. `(site)/layout.tsx` already
 * removed ambient motion from this surface for the weaker of those two
 * reasons.
 *
 * Deliberately NOT a `/quizzes` prefix match: the quiz overview and the
 * post-attempt review are ordinary pages, and they are exactly where a
 * student who just failed something wants to ask a question.
 */
const ATTEMPT = /^\/quizzes\/[^/]+\/attempt\/[^/]+$/u;

export function shouldMountAssistant(pathname: string): boolean {
  // The review screen sits UNDER the attempt path but is not the attempt — it
  // is read-only, the paper is already graded, and it is the single most
  // likely place a student wants to appeal or ask.
  if (pathname.endsWith('/review')) return !SUPPRESSED.some((prefix) => isUnder(pathname, prefix));
  if (ATTEMPT.test(pathname)) return false;
  return !SUPPRESSED.some((prefix) => isUnder(pathname, prefix));
}

/**
 * Prefix match on SEGMENT boundaries.
 *
 * `pathname.startsWith('/admin')` would also suppress a future
 * `/administration` or `/admin-guide`, and the failure would be invisible —
 * a page that quietly never shows the widget, with nothing to grep for.
 */
function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * The query parameter that opens the widget straight onto the thread.
 *
 * A reply notification has nowhere else to send a student: the conversation
 * lives in the widget, and giving it a page of its own would mean two places
 * to read the same messages. The widget derives its open state from this
 * rather than storing it, and strips it on close so a refresh does not reopen
 * the panel forever.
 */
export const ASSISTANT_OPEN_PARAM = 'assistant';
