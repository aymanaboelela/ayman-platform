import type { AccessScope } from '../../generated/prisma/client';

/**
 * The two facts every "does this student have access right now" answer is
 * built from, extracted so the THREE callers that need them cannot drift
 * apart on what «access» means.
 *
 * Before this module existed there were two: `EntitlementService`, which
 * decides access one course at a time and cares WHY it was refused, and
 * `EnrollmentService.listOwn`, which needs the same verdict for a whole
 * list and cares only whether it is yes or no. A second, hand-copied grant
 * loop in the list would be the exact bug this file exists to make
 * impossible — an enrollment row that still reports «enrolled» after the
 * grant behind it lapsed sends the student somewhere they cannot pay.
 *
 * Nothing here touches Prisma or Nest: both functions are pure, take `now`
 * rather than reading the clock, and are unit-testable without a database.
 */

/** Just the columns the verdict is computed from — accepts a Prisma row or a
 *  hand-built test fixture. */
export interface GrantWindow {
  validFrom: Date;
  validUntil: Date | null;
  revokedAt: Date | null;
}

/**
 * Why a single grant does not open a door, or `'live'` when it does.
 *
 * The order matters and matches `CourseAccess`'s severity ordering: a revoked
 * grant is revoked even if its window has also passed, because `revokedAt` is
 * an action somebody took and a lapsed date is not.
 */
export type GrantLiveness = 'live' | 'revoked' | 'not_yet_valid' | 'expired';

export function grantLiveness(grant: GrantWindow, now: Date): GrantLiveness {
  if (grant.revokedAt !== null) return 'revoked';
  if (grant.validFrom > now) return 'not_yet_valid';
  // `<=`, not `<`: a grant whose last instant is exactly now is spent.
  if (grant.validUntil !== null && grant.validUntil <= now) return 'expired';
  return 'live';
}

/** The course shape both callers already have selected. */
export interface CourseAccessSubject {
  id: string;
  subjectId: string;
  requiresGrant: boolean;
}

/** One entry of the `OR` a grant query filters on — also the shape matched
 *  in memory when a batch of grants has already been fetched. */
export type CourseAccessScope =
  | { scope: Extract<AccessScope, 'platform'> }
  | { scope: Extract<AccessScope, 'course'>; courseId: string }
  | { scope: Extract<AccessScope, 'subject_teacher'>; subjectId: string }
  | { scope: Extract<AccessScope, 'term'>; courseId: string }
  | { scope: Extract<AccessScope, 'course_month'>; courseId: string };

/**
 * WHICH SCOPES COUNT for a course — the whole of what `requiresGrant`
 * changes, stated once.
 *
 * A free course is satisfied by any of the five, including the platform-wide
 * "v1 is free for everyone" grant. A closed one drops `platform`, so it takes
 * a grant naming this course (or its subject, or one of its terms, or one of
 * its months) specifically.
 *
 * `term` and `course_month` are in BOTH branches and are matched on `courseId`
 * alone, never on `termId`/`monthId` — this answers "does this student have
 * SOME access to this course at all", not "which slice of it". The per-lesson
 * "is it THIS term / THIS month" question belongs to
 * `EntitlementService.resolveTermAccess` and `resolveMonthAccess`.
 *
 * Leaving `course_month` OUT of this list would have been the quiet bug: a
 * student who bought «شهر ٢» and nothing else would read as having no access
 * to the course at all, so `enroll()` would refuse them, `EnrollmentService
 * .listOwn` would drop the course off their dashboard, and
 * `LessonAccessService.require`'s lapsed-grant check would 403 them out of the
 * very month they paid for.
 */
export function courseAccessScopes(course: CourseAccessSubject): CourseAccessScope[] {
  const specific: CourseAccessScope[] = [
    { scope: 'course', courseId: course.id },
    { scope: 'subject_teacher', subjectId: course.subjectId },
    { scope: 'term', courseId: course.id },
    { scope: 'course_month', courseId: course.id },
  ];
  return course.requiresGrant ? specific : [{ scope: 'platform' }, ...specific];
}

/** A grant as the in-memory matcher below needs to see it. */
export interface ScopedGrant extends GrantWindow {
  scope: AccessScope;
  courseId: string | null;
  subjectId: string | null;
}

/** Whether one already-fetched grant is one of the grants that could open
 *  this course — the in-memory twin of the `OR` `courseAccessScopes` builds. */
export function grantCoversCourse(grant: ScopedGrant, course: CourseAccessSubject): boolean {
  return courseAccessScopes(course).some((candidate) => {
    if (candidate.scope !== grant.scope) return false;
    if (candidate.scope === 'platform') return true;
    if (candidate.scope === 'subject_teacher') return grant.subjectId === candidate.subjectId;
    return grant.courseId === candidate.courseId;
  });
}

/**
 * The list-side verdict: is ANY of these grants live and wide enough to open
 * this course, right now.
 *
 * Deliberately boolean. The one-course path needs the reason and has
 * `EntitlementService.resolveCourseAccess` for it; a list of a student's
 * courses only ever asks yes or no, and returning a reason here would invite
 * a second severity-ordering loop to drift from the first.
 */
export function hasLiveCourseAccess(
  grants: ScopedGrant[],
  course: CourseAccessSubject,
  now: Date,
): boolean {
  return grants.some(
    (grant) => grantCoversCourse(grant, course) && grantLiveness(grant, now) === 'live',
  );
}
