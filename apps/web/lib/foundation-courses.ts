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

/**
 * The same courses, minus any that already belong to `year`.
 *
 * `/years/[year]` lists a year by `course.year`, and the foundation course
 * carries one year like everything else — `2` today — so it appeared on
 * exactly one of the three pages and the other two said «لسه مفيش كورسات
 * منشورة للصف ده» to a student who had a published course to start. That is
 * wrong on the merits: تأسيس is the phase BEFORE the curriculum, not a slice
 * of it, and the catalogue does not gate on the year in the first place — see
 * `/courses`, where every student sees every course and the year is a label.
 *
 * ⚠️ FILTERED AGAINST THE YEAR, so the course is listed ONCE on its own year's
 * page — under its subject, where it belongs — and as the standalone opener on
 * the other two. Without this it would render twice on year 2: once in the
 * section below and once inside «البرمجة».
 */
export function foundationCoursesOutsideYear(
  courses: readonly CatalogCourse[],
  year: number,
): CatalogCourse[] {
  return foundationCourses(courses).filter((course) => course.year !== year);
}
