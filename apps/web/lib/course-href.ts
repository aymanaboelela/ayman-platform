/**
 * Where a signed-in student's click on one of THEIR OWN courses lands.
 *
 * ## The bug this exists to make unrepeatable
 *
 * Two components — the rail's «كورساتي» list and the dashboard's enrolled-course
 * card — each carried their own copy of this expression, and both copies said:
 *
 *     course.lastLessonId
 *       ? `/courses/${slug}/lessons/${course.lastLessonId}`
 *       : `/courses/${slug}`                                  // ← wrong
 *
 * That fallback is the PUBLIC marketing page. A student who had enrolled but
 * not yet opened a lesson — which is every student on their first day, and
 * every student who enrolls from the catalog — clicked their own course and was
 * thrown out of the student shell onto a sales page that shows a lock badge and
 * «الدروس بتفتح أول ما تدخل بحسابك» over a course they are already enrolled in.
 * Verified end to end: the destination was `/courses/e2e-demo-course`, outside
 * the shell, with the locked note rendered.
 *
 * The in-shell equivalent — `/library/[slug]` — already existed and already
 * renders the outline with the real gate state. Nothing needed building; the
 * two links were pointing at the wrong one of two pages that both existed.
 *
 * ## Why a function and not a corrected copy in each file
 *
 * Both call sites carried a comment saying they were "deliberately identical"
 * to each other. They were identical, and identically wrong, which is the
 * failure mode that comment was written to prevent and could not. One function,
 * imported twice, is the version where fixing it once fixes it everywhere.
 */

export interface CourseDestination {
  /** The course's URL slug. */
  slug: string;
  /** The lesson the student last opened, when the API knows of one. */
  lastLessonId?: string | null;
}

/**
 * Resume at the last lesson when there is one, otherwise the in-shell course
 * page — which picks the first open lesson itself and states the gate for the
 * rest. Never a dead link, and never the public page.
 *
 * `encodeURIComponent` on the slug: slugs are API-supplied and reach the DOM as
 * an `href`. They are generated conservatively today, and this is the cheap
 * version of not depending on that staying true.
 */
export function enrolledCourseHref(course: CourseDestination): string {
  const slug = encodeURIComponent(course.slug);
  return course.lastLessonId
    ? `/courses/${slug}/lessons/${encodeURIComponent(course.lastLessonId)}`
    : `/library/${slug}`;
}

/**
 * The in-shell course page, unconditionally — for links that mean "show me this
 * course", not "put me back where I was". The library grid uses this.
 */
export function courseHref(slug: string): string {
  return `/library/${encodeURIComponent(slug)}`;
}
