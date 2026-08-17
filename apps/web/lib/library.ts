import type {
  CatalogCourse,
  LearningPath,
  ProfileMe,
  SchoolStream,
  Taxonomy,
} from '@ayman/contracts';
import { copy } from '@ayman/contracts';
import { FIXED_SYSTEM_SLUG } from '@/lib/section-defaults';

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
  /** `null` when the student is not enrolled — the card says «نبدأ الكورس». */
  progressPercent: number | null;
  clearedLessons: number;
  /** Where «نكمّل» points. Null when not enrolled, or when the course is done. */
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
  /**
   * `null` for a profile onboarded before the question existed. Null means
   * "do not filter by stream" — never "عام" — because a student who was never
   * asked must not silently lose the لغات courses they have been seeing all
   * along.
   *
   * The raw value drives the filter and the label draws the chip; both are
   * carried so neither has to be recovered from the other, and so no rule is
   * ever expressed as a comparison between two Arabic strings.
   */
  schoolStream: SchoolStream | null;
  schoolStreamLabelAr: string | null;
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

/**
 * `taxonomy` is nullable here because `getTaxonomyOrNull()` can return null —
 * the API was unreachable, or the read was rate-limited — and a missing
 * reference table must degrade the LABEL, never the page. The fallback below
 * already existed for a year the taxonomy fails to describe; a taxonomy that
 * did not arrive at all lands on the identical branch, which is why there is
 * one fallback and not two.
 *
 * ## Why the system is now searched in a fixed order
 *
 * This walked `taxonomy.systems` and took the first row with a matching
 * `year`, which was harmless for exactly as long as both systems agreed on the
 * label. They no longer do, and deliberately: البكالوريا's year 2 is «الصف
 * الثاني بكالوريا» and الثانوية العامة's is «الصف الثاني الثانوي» (migration
 * `20260818120000_bacalorya_year_labels`). With two different answers in the
 * table, "the first one" is decided by `sortOrder` — a column an admin can
 * change from /admin/taxonomy/systems without any idea that a student's year
 * would be renamed across the product as a side effect.
 *
 * So the platform's own system is named and preferred. `FIXED_SYSTEM_SLUG` is
 * the same constant `fixedSectionFor` writes onto every profile at onboarding,
 * so this asks for the label of the system the student is provably in. The
 * scan is kept as a fallback for a database where that system is missing or
 * has not been seeded with years — a broken heading is still better than none.
 */
function findYearLabel(taxonomy: Taxonomy | null, year: number): string {
  const systems = taxonomy?.systems ?? [];
  const preferred = systems.find((system) => system.slug === FIXED_SYSTEM_SLUG);
  for (const system of preferred ? [preferred, ...systems] : systems) {
    const found = system.years.find((y) => y.year === year);
    if (found) return found.labelAr;
  }
  // A year the taxonomy does not describe is a data problem, not a render
  // problem — the group still needs a heading a student can read.
  return `الصف ${year}`;
}

/**
 * Who the student is, in labels rather than in ids.
 *
 * Split out of `buildLibrary` when the dashboard's hero band became the second
 * caller. It needs the same year and track a student sees on `/library` and
 * nothing else the library builds — no catalog, no path — and the alternative
 * was either fetching those two payloads on the dashboard to throw them away,
 * or a second copy of the id→label lookup that could disagree with this one
 * about what year 3 is called.
 */
export function identityOf(me: ProfileMe, taxonomy: Taxonomy | null): LibraryIdentity | null {
  const year = me.profile?.year ?? null;
  // `taxonomy` is nullable because NOTHING it feeds is load-bearing: it turns
  // a stored year and trackId into labels, and a caller without it prints no
  // label. The dashboard was first — all it decides there is whether a chip is
  // printed beside the greeting — and `/library` now reads through the same
  // `getTaxonomyOrNull()` loader rather than its own uncached `apiGet`, so it
  // can see null too. Passing null lands on the same branch as a student who
  // has not chosen a year: the identity strip prompts instead, which is a
  // state this screen has always rendered.
  if (year === null || taxonomy === null) return null;
  const schoolStream = me.profile?.schoolStream ?? null;
  return {
    year,
    yearLabelAr: findYearLabel(taxonomy, year),
    trackLabelAr: findTrackLabel(taxonomy, me.profile?.trackId),
    schoolStream,
    schoolStreamLabelAr: schoolStream === null ? null : copy.stream[schoolStream],
  };
}

/**
 * Does this course serve the student's school? مدرسة عام ولا مدرسة لغات.
 *
 * Two rules, and the second is the one that matters:
 *
 * - a course serving BOTH streams (the default every course was created with)
 *   is everybody's, so nothing changes for content nobody has tagged yet;
 * - a student with NO stream — onboarded before the question existed — matches
 *   everything. Treating them as «عام» would quietly delete the لغات courses
 *   from a library they have been looking at for weeks, on the strength of a
 *   question they were never asked.
 */
function servesStudentStream(course: CatalogCourse, identity: LibraryIdentity): boolean {
  if (identity.schoolStream === null) return true;
  return identity.schoolStream === 'languages' ? course.forLanguages : course.forGeneral;
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
  /**
   * `null` when `getTaxonomyOrNull()` could not reach the API. Every course on
   * this page comes from the CATALOG, which carries its own `year` and
   * `trackLabelAr`, so the grid still groups and still renders in full — only
   * the year HEADINGS fall back to «الصف ٢» and «كورساتك» collapses into the
   * same "no identity yet" state a student sees before onboarding. A degraded
   * library beats Next's error page, which is what an uncached `apiGet` here
   * produced the moment the shared throttle bucket ran out.
   */
  taxonomy: Taxonomy | null;
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

  const identity = identityOf(me, taxonomy);

  /**
   * Their year, either their track or the untracked cell, and a course that
   * serves their school. Written as one predicate rather than a filter chain
   * so the parts cannot drift: a student with no track still sees every
   * untracked course in their year (the correct year-1 behaviour), and a
   * student with no stream still sees everything (see `servesStudentStream`).
   *
   * A course this drops is not hidden — it lands in «باقي الصفوف» exactly as
   * another track's course does, still openable. ⚠️ Presentation, never
   * access: the note at the top of this file applies unchanged.
   */
  const isOwn = (course: CatalogCourse): boolean =>
    identity !== null &&
    course.year === identity.year &&
    (course.trackLabelAr === null || course.trackLabelAr === identity.trackLabelAr) &&
    servesStudentStream(course, identity);

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
