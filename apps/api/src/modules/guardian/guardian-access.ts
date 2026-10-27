import type { GuardianAccess } from '@ayman/contracts/guardian-view';
import type { AccessScope } from '../../generated/prisma/client';
import { CONTENT_SCOPES } from '../entitlement/content-access';
import {
  grantCoversCourse,
  grantLiveness,
  hasLiveCourseAccess,
  type CourseAccessSubject,
  type ScopedGrant,
} from '../entitlement/grant-liveness';

/**
 * «الاشتراك» as the parent should read it — from the GRANTS, never from the
 * enrollment row.
 *
 * Nothing on the platform writes `EnrollmentStatus.expired`, so a lapsed
 * student's row says `active` for ever (`enrollment-outlives-the-subscription`).
 * The question «is it running» is `hasLiveCourseAccess` — the same predicate
 * `GET /api/enrollments` (`accessActive`) and `EntitlementService` answer it
 * with — and «until when» and «what was bought» are read off the same live
 * grants, so the three facts cannot disagree.
 *
 * Pure: the caller fetches every grant once for the whole page.
 */

export interface AccessGrantRow extends ScopedGrant {
  id: string;
  monthId: string | null;
  lessonId?: string | null;
  sectionId?: string | null;
}

/** Which plan a live wide grant is. `course`/`subject_teacher`/`platform` all
 *  open the whole course. */
function planOf(scope: AccessScope): GuardianAccess['plan'] {
  if (scope === 'course_month') return 'months';
  if (scope === 'term') return 'term';
  return 'full';
}

const PLAN_WIDTH: Record<NonNullable<GuardianAccess['plan']>, number> = { full: 3, term: 2, months: 1 };

export function accessFor(
  course: CourseAccessSubject,
  grants: readonly AccessGrantRow[],
  monthTitles: ReadonlyMap<string, { title: string; index: number }>,
  now: Date,
): GuardianAccess {
  if (hasLiveCourseAccess([...grants], course, now)) {
    const live = grants.filter(
      (grant) => grantCoversCourse(grant, course) && grantLiveness(grant, now) === 'live',
    );
    // The widest plan held — a yearly subscriber who also bought «شهر ٢» is on
    // the year, not on a month (`monthSliceOf` unions the same way).
    let plan: NonNullable<GuardianAccess['plan']> = 'months';
    for (const grant of live) {
      const candidate = planOf(grant.scope) as NonNullable<GuardianAccess['plan']>;
      if (PLAN_WIDTH[candidate] > PLAN_WIDTH[plan]) plan = candidate;
    }
    const onPlan = live.filter((grant) => planOf(grant.scope) === plan);

    // Open-ended wins: one grant with no end date means the access has none.
    const validUntil = onPlan.some((grant) => grant.validUntil === null)
      ? null
      : onPlan.reduce<Date | null>(
          (latest, grant) => (latest === null || (grant.validUntil as Date) > latest ? grant.validUntil : latest),
          null,
        );

    const months =
      plan === 'months'
        ? [...new Set(onPlan.flatMap((grant) => (grant.monthId ? [grant.monthId] : [])))]
            .flatMap((id) => {
              const month = monthTitles.get(id);
              return month ? [month] : [];
            })
            .sort((a, b) => a.index - b.index)
            .map((month) => month.title)
        : [];

    return { state: 'active', plan, months, validUntil: validUntil?.toISOString() ?? null };
  }

  // No subscription — but «فتح بكود» may still open lectures in it.
  const codes = grants.some(
    (grant) =>
      grant.courseId === course.id &&
      (CONTENT_SCOPES as readonly string[]).includes(grant.scope) &&
      grantLiveness(grant, now) === 'live',
  );
  return { state: codes ? 'codes' : 'ended', plan: null, months: [], validUntil: null };
}
