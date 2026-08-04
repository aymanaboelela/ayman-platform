import type { CatalogCourse, LearningPath, ProfileMe, Taxonomy } from '@ayman/contracts';
import { copy } from '@ayman/contracts';

const c = copy.library;

/**
 * The `/library` view model: the public catalog joined to what THIS student has
 * actually done with it, then cut into the groups the screen renders.
 *
 * ## Why this is a pure function and not a fetch
 *
 * Every input already has an endpoint that owns it — the catalog is cached for
 * hours, the path is per-request and authed, the taxonomy is shared with
 * onboarding and the admin panel. Adding a fifth endpoint that returns the
 * three of them pre-joined would put the SAME grouping rule in two places (here
 * and in Nest) with nothing keeping them equal. Joining on the web side costs
 * one extra round trip that is already parallel with the others, and it makes
 * the entire rule below unit-testable without a database.
 *
 * ## The grouping rule
 *
 * A course belongs to a `(year, track)` cell. `trackLabelAr === null` is not
 * "no group" — it means the course is for EVERY track in its year, which is
 * how year 1 works (tracks are chosen at the start of year 2) and how a shared
 * year-2 course works. Those render under «عام».
 *
 * ## What "the student's own courses" means
 *
 * Their year, and either their track or no track at all. Anything else is
 * another year's or another track's material: still openable — v1 is free for
 * every registered student and nothing here is an entitlement check — but
 * listed under «باقي الصفوف» rather than counted as theirs.
 *
 * ⚠️ This is a PRESENTATION rule, never an access rule. Access is decided by
 * `/api/lessons/:id/player` and the progression gate, which re-derive it on
 * every request. Nothing on this screen can grant or deny anything.
 */

export interface LibraryCourse {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  subjectNameAr: string;
  coverKey: string | null;
  lessonCount: number;
  totalSeconds: number;
  /** `null` when the student is not enrolled — the card says «ابدأ الكورس». */
  progressPercent: number | null;
  clearedLessons: number;
  /** Where «كمّل» points. Null when not enrolled, or when the course is done. */
  nextLessonId: string | null;
}

export interface LibraryTrackGroup {
  /** Stable across renders: the track label, or `''` for the untracked cell. */
  key: string;
  labelAr: string;
  courses: LibraryCourse[];
}

export interface LibraryYearGroup {
  year: number;
  labelAr: string;
  courseCount: number;
  tracks: LibraryTrackGroup[];
}

export interface LibraryIdentity {
  year: number;
  yearLabelAr: string;
  /** `null` for year 1, which has no track at all. */
  trackLabelAr: string | null;
}

export interface LibraryView {
  /** `null` until onboarding has set a year — the strip prompts instead. */
  identity: LibraryIdentity | null;
  /** `null` when there is no identity to filter by. */
  yours: LibraryTrackGroup[] | null;
  rest: LibraryYearGroup[];
  totalCourses: number;
}

/** The label a course's track cell renders under. */
function trackKey(course: CatalogCourse): string {
  return course.trackLabelAr ?? '';
}

function trackLabel(key: string): string {
  return key === '' ? c.trackGeneral : key;
}

/**
 * Groups courses into track cells, in first-seen order so the catalog's own
 * `position` ordering survives the grouping. `عام` is forced last: it reads as
 * the fallback cell, and a fallback listed first makes the specific tracks look
 * like an afterthought.
 */
function byTrack(courses: LibraryCourse[], keys: string[]): LibraryTrackGroup[] {
  const cells = new Map<string, LibraryCourse[]>();
  courses.forEach((course, i) => {
    const key = keys[i]!;
    const cell = cells.get(key);
    if (cell) cell.push(course);
    else cells.set(key, [course]);
  });

  return [...cells.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : 0))
    .map(([key, list]) => ({ key, labelAr: trackLabel(key), courses: list }));
}

/**
 * Resolves the student's track id to its Arabic label.
 *
 * Searches every system rather than only the student's own, because
 * `ProfileMe.systemId` and `trackId` are independently nullable and a track id
 * is globally unique — scoping the search to a system that happens to be null
 * would drop a label the student can plainly see on their profile.
 */
function findTrackLabel(taxonomy: Taxonomy, trackId: string | null | undefined): string | null {
  if (!trackId) return null;
  for (const system of taxonomy.systems) {
    const track = system.tracks.find((t) => t.id === trackId);
    if (track) return track.labelAr;
  }
  return null;
}

function findYearLabel(taxonomy: Taxonomy, year: number): string {
  for (const system of taxonomy.systems) {
    const found = system.years.find((y) => y.year === year);
    if (found) return found.labelAr;
  }
  // A year the taxonomy does not describe is a data problem, not a render
  // problem — the group still needs a heading a student can read.
  return `الصف ${year}`;
}

export function buildLibrary({
  courses,
  path,
  me,
  taxonomy,
}: {
  courses: CatalogCourse[];
  path: LearningPath;
  me: ProfileMe;
  taxonomy: Taxonomy;
}): LibraryView {
  const progress = new Map(path.courses.map((course) => [course.id, course]));

  const toLibraryCourse = (course: CatalogCourse): LibraryCourse => {
    const enrolled = progress.get(course.id);
    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      subtitle: course.subtitle,
      subjectNameAr: course.subjectNameAr,
      coverKey: course.coverKey,
      lessonCount: course.lessonCount,
      totalSeconds: course.totalSeconds,
      progressPercent: enrolled ? enrolled.progressPercent : null,
      clearedLessons: enrolled ? enrolled.clearedLessons : 0,
      nextLessonId: enrolled ? enrolled.nextLessonId : null,
    };
  };

  const year = me.profile?.year ?? null;
  const trackLabelAr = findTrackLabel(taxonomy, me.profile?.trackId);

  const identity: LibraryIdentity | null =
    year === null ? null : { year, yearLabelAr: findYearLabel(taxonomy, year), trackLabelAr };

  /**
   * Their year, and either their track or the untracked cell. Written as one
   * predicate rather than a filter chain so the two halves cannot drift: a
   * student with no track still sees every untracked course in their year,
   * which is the correct year-1 behaviour.
   */
  const isOwn = (course: CatalogCourse): boolean =>
    identity !== null &&
    course.year === identity.year &&
    (course.trackLabelAr === null || course.trackLabelAr === identity.trackLabelAr);

  const ownCourses = identity === null ? [] : courses.filter(isOwn);
  const restCourses = courses.filter((course) => !ownCourses.includes(course));

  const yours =
    identity === null
      ? null
      : byTrack(ownCourses.map(toLibraryCourse), ownCourses.map(trackKey));

  // The remaining years, ascending — a student browsing outside their own year
  // is looking for what comes before or after it, and a stable ascending run is
  // the only order in which "before" and "after" mean anything.
  const years = new Map<number, CatalogCourse[]>();
  for (const course of restCourses) {
    const bucket = years.get(course.year);
    if (bucket) bucket.push(course);
    else years.set(course.year, [course]);
  }

  const rest: LibraryYearGroup[] = [...years.entries()]
    .sort(([a], [b]) => a - b)
    .map(([groupYear, list]) => ({
      year: groupYear,
      labelAr: findYearLabel(taxonomy, groupYear),
      courseCount: list.length,
      tracks: byTrack(list.map(toLibraryCourse), list.map(trackKey)),
    }));

  return { identity, yours, rest, totalCourses: courses.length };
}
