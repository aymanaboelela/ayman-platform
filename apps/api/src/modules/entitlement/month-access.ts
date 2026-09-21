import type { AccessScope } from '../../generated/prisma/client';
import { grantLiveness, type GrantLiveness, type GrantWindow } from './grant-liveness';

/** Why a grant did not count, never `'live'` — the reason a REFUSAL carries.
 *  Narrowed so `CourseAccess`'s reason union does not have to widen to admit a
 *  value that means the opposite of a denial. */
type LapsedReason = Exclude<GrantLiveness, 'live'>;

/**
 * «الاشتراك الشهري بقى شهر من المنهج» — the pure half of the month gate.
 *
 * It lives beside `grant-liveness.ts` and for the same stated reason: there are
 * TWO callers that need the same verdict and they ask different questions of
 * it. `EntitlementService.resolveMonthAccess` decides ONE lesson and needs to
 * say WHY it refused, because the student reads that sentence and pays money
 * because of it. `LessonGateService.resolveCourse` decides a whole outline at
 * once and needs only yes or no, per lesson, cheaply.
 *
 * A second hand-rolled grant loop in the outline is the exact bug this file
 * exists to make impossible, and it is a worse bug here than it was there: the
 * outline and the player would disagree about which lectures a student owns, so
 * a row would draw open and then 403, or draw locked on something already paid
 * for. Both readings are the same function; only the return shape differs.
 *
 * Nothing here touches Prisma or Nest. `now` is passed in, never read.
 */

/** Just the columns the slice is computed from — a Prisma row or a fixture. */
export interface MonthScopedGrant extends GrantWindow {
  id: string;
  scope: AccessScope;
  monthId: string | null;
}

/**
 * WHICH MONTHS a student's live grants open, for one course.
 *
 * `everything: true` is not "all the months" — it is wider than that, and the
 * difference matters for an untagged lecture. A term or yearly subscriber holds
 * the whole course including lectures that belong to no month at all; a student
 * holding every month individually does not, because a lecture with no
 * `LessonMonth` row is in no month for a month grant to name. Collapsing the
 * two would quietly hand the untagged back-catalogue to whoever bought the
 * months, which is the leak the instructor's own rule closes.
 */
export type MonthSlice =
  /** `grantId` is the WIDE grant that made it everything — the term, the year,
   *  the admin grant. Carried because `CourseAccess` promises an id an admin
   *  can audit the decision against, and "the newest live grant" is the wrong
   *  answer to that: it is routinely a month grant that had nothing to do with
   *  the allow. */
  | { everything: true; grantId: string }
  | {
      everything: false;
      monthIds: ReadonlySet<string>;
      /** Which grant opened each month, for the same provenance reason. */
      grantIdByMonth: ReadonlyMap<string, string>;
      lapsed: LapsedReason | null;
    };

/**
 * Reduce a student's grants for ONE course to what they open.
 *
 * The caller must have queried with `courseAccessScopes(course)`, so every
 * grant in here is already one that could open this course — this function
 * never re-checks scope targets and must not be handed a foreign course's
 * grants.
 *
 * UNION, never "the winning grant". `resolveCourseAccess` returns a single
 * grant ordered `validFrom DESC, id DESC` — the newest, which is not the
 * widest. A student who tops up «شهر ٢» in March while holding a yearly
 * subscription bought in September would have the year narrowed to the month by
 * any single-winner reading, losing access he holds a live, paid, unrevoked
 * grant for. Unioning can only ever allow more, never less, which is the
 * direction a mistake here has to fail in.
 */
export function monthSliceOf(grants: readonly MonthScopedGrant[], now: Date): MonthSlice {
  const grantIdByMonth = new Map<string, string>();
  let lapsed: LapsedReason | null = null;

  for (const grant of grants) {
    const liveness = grantLiveness(grant, now);
    if (liveness !== 'live') {
      lapsed ??= liveness;
      continue;
    }

    // platform / course / subject_teacher / term all cover EVERY month.
    // Requirement 3 in the instructor's own words: «لو واحد اشترك ترم، خلاص
    // الترم ده كله مفتوح», and the same for the year. A `term` grant is
    // narrowed on the TERM axis by `resolveTermAccess`; narrowing it again
    // here would shut «شهر ٣» for the person who bought the term it sits in.
    if (grant.scope !== 'course_month') return { everything: true, grantId: grant.id };

    // First writer wins, and the list arrives newest-first — so a month bought
    // twice reports the newer grant, which is the one an admin looking at it
    // would expect to find.
    if (grant.monthId !== null && !grantIdByMonth.has(grant.monthId)) {
      grantIdByMonth.set(grant.monthId, grant.id);
    }
  }

  return {
    everything: false,
    monthIds: new Set(grantIdByMonth.keys()),
    grantIdByMonth,
    lapsed,
  };
}

/**
 * Does this slice open a lecture carrying these months?
 *
 * An empty `lessonMonthIds` is the closed case, and deliberately so: a lecture
 * the instructor has not tagged reaches term and yearly subscribers (who match
 * `everything`) and no monthly one. The alternative default — untagged means
 * everyone — turns every lecture he forgets into a free sample of a month
 * nobody paid for, and the screen looks correct the whole time.
 */
export function sliceCoversLesson(
  slice: MonthSlice,
  lessonMonthIds: readonly string[],
): boolean {
  if (slice.everything) return true;
  return lessonMonthIds.some((id) => slice.monthIds.has(id));
}

/**
 * WHICH grant opened this lecture — `null` when none did.
 *
 * Separate from `sliceCoversLesson` because the two callers need different
 * things: the outline needs a boolean per row and would throw the id away, and
 * the single-lesson path needs the id for `CourseAccess`'s audit promise.
 * Reading "the newest live grant" instead is what made a yearly subscriber's
 * allow report the id of an unrelated month grant they bought yesterday.
 */
export function grantOpeningLesson(
  slice: MonthSlice,
  lessonMonthIds: readonly string[],
): string | null {
  if (slice.everything) return slice.grantId;
  for (const id of lessonMonthIds) {
    const grantId = slice.grantIdByMonth.get(id);
    if (grantId !== undefined) return grantId;
  }
  return null;
}
