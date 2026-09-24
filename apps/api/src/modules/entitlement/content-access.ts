import type { AccessScope } from '../../generated/prisma/client';
import { grantLiveness, type GrantWindow } from './grant-liveness';

/**
 * «فتح بكود» — the pure half of the unit/lecture gate.
 *
 * A `scope: section` or `scope: lesson` grant is written by one thing only,
 * `UnlockCodesService.redeem`, and read by two: the single-lesson gate
 * (`LessonAccessService.requireEntitled`, which also guards the quiz and the
 * homework on that lecture) and the outline (`LessonGateService.resolveCourse`,
 * which draws the padlocks). Both reduce the same grants with the functions
 * below, for the reason `month-access.ts` gives: two hand-rolled loops are how
 * a row draws open and then refuses on click.
 *
 * ## Why these scopes are NOT in `courseAccessScopes`
 *
 * A code for one lecture is not access to the course. Every counter, list and
 * money screen on the platform asks «does this student have the course» by way
 * of that function, and all of them must keep answering no for a student who
 * bought lecture 3 — otherwise the headcount grows by one per lecture sold and
 * the finance screen shows a subscription nobody paid for. So these grants are
 * invisible to everything except the two readers above, by construction rather
 * than by each reader remembering to filter them out.
 *
 * Nothing here touches Prisma or Nest. `now` is passed in, never read.
 */

export const CONTENT_SCOPES = ['section', 'lesson'] as const satisfies readonly AccessScope[];

/** Just the columns the slice is computed from — a Prisma row or a fixture. */
export interface ContentScopedGrant extends GrantWindow {
  id: string;
  scope: AccessScope;
  sectionId: string | null;
  lessonId: string | null;
}

/** Which units and which single lectures a student's LIVE code grants open,
 *  for one course — each mapped to the grant that opened it, for the audit
 *  promise `CourseAccess` makes. */
export interface ContentSlice {
  sections: ReadonlyMap<string, string>;
  lessons: ReadonlyMap<string, string>;
}

export const EMPTY_CONTENT_SLICE: ContentSlice = { sections: new Map(), lessons: new Map() };

/**
 * UNION of every live grant — same direction as `monthSliceOf`: a mistake here
 * can only ever open less than was paid for if it narrows, so it never does.
 * A revoked grant (the admin pulled the code) contributes nothing.
 */
export function contentSliceOf(grants: readonly ContentScopedGrant[], now: Date): ContentSlice {
  const sections = new Map<string, string>();
  const lessons = new Map<string, string>();
  for (const grant of grants) {
    if (grantLiveness(grant, now) !== 'live') continue;
    if (grant.scope === 'section' && grant.sectionId !== null && !sections.has(grant.sectionId)) {
      sections.set(grant.sectionId, grant.id);
    }
    if (grant.scope === 'lesson' && grant.lessonId !== null && !lessons.has(grant.lessonId)) {
      lessons.set(grant.lessonId, grant.id);
    }
  }
  return { sections, lessons };
}

/** The grant that opens this lecture through a code, or `null`. The lecture's
 *  own grant wins over its unit's — it is the more specific provenance. */
export function contentGrantOpening(
  slice: ContentSlice,
  lesson: { id: string; sectionId: string },
): string | null {
  return slice.lessons.get(lesson.id) ?? slice.sections.get(lesson.sectionId) ?? null;
}

/**
 * What the lesson gate needs to know about codes for one student and course.
 *
 * `codeOnly` is the part that makes a code for ONE lecture open one lecture.
 *
 * The enrollment row is, everywhere else on the platform, the key to the whole
 * course: `LessonAccessService` lets any active enrollment through unless a
 * grant has specifically LAPSED, and deliberately does not re-apply «this
 * course needs a grant» to a student who is already inside (see its own
 * `LAPSED_GRANT_REASONS` note). Redeeming a code has to create an enrollment —
 * nothing reaches a lesson without one — so without this flag a lecture code
 * would be a full-course key with extra steps.
 *
 * So: when the enrollment was minted BY a code (`source: 'code'`) and the
 * student holds no live course-wide grant (course / term / month / subject),
 * everything a code did not name is closed. The moment they buy the course,
 * the payment rewrites `source` to `purchase` and a live grant exists, so the
 * flag is off again without anybody having to remember to clear it.
 */
export interface ContentAccess {
  slice: ContentSlice;
  codeOnly: boolean;
}
