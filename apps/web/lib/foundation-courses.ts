import type { CatalogCourse } from '@ayman/contracts/catalog';

/**
 * "The foundation course" — what `/essentials` puts under the twelve terms.
 *
 * ⚠️ MATCHED ON THE COURSE'S OWN NAME, because there is nothing better to match
 * on yet. `CatalogCourse` carries a system, a year, a track and a subject; none
 * of them says «this is where a beginner starts», and every published course is
 * `year: 2` on the البكالوريا track today. A real flag on the course — set in
 * the admin, carried on the catalog contract — is the durable answer, and this
 * is deliberately the smallest thing that is TRUE in the meantime rather than a
 * hardcoded slug, which would go stale the day a second one is published.
 *
 * «تأسيس» is not an incidental word in an Egyptian course title: it is the name
 * of the phase, the way «مراجعة» or «امتحان» are. The subtitle is searched too
 * because a course may carry the year in its title and the phase underneath it.
 *
 * No match returns an empty list, and the page renders no section at all — the
 * glossary it sits under is a complete page on its own. Showing an unrelated
 * course under «الكورس التأسيسي» would be worse than showing none.
 */
const FOUNDATION = /تأسيس/;

export function foundationCourses(courses: readonly CatalogCourse[]): CatalogCourse[] {
  return courses.filter(
    (course) => FOUNDATION.test(course.title) || FOUNDATION.test(course.subtitle ?? ''),
  );
}
