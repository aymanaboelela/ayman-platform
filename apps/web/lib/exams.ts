import { cache } from 'react';
import { StudentExamsSchema, type StudentExam, type StudentExams } from '@ayman/contracts/quiz/scheduled';
import { apiGetAuthed } from './api-server';

/**
 * `GET /api/me/exams` — «امتحانات الشهر» for every course this student is
 * enrolled in, shared across one render, and never fatal.
 *
 * ## Why `cache()` and NOT `'use cache'`
 *
 * The same split, and the same reasoning, `lib/mastery.ts` argues at length:
 * `'use cache'` is legal for `lib/taxonomy.ts` because that read is
 * unauthenticated and identical for every student. This one is neither — it
 * carries the caller's own marks — and it takes NO ARGUMENTS, so a shared cache
 * entry would have nothing to key on and would serve the FIRST student's
 * results to everyone who loaded the dashboard after them. `cache()` is
 * per-request, and `apiGetAuthed` leaves its `fetch` on `no-store`.
 *
 * ## Why it returns an empty payload instead of throwing
 *
 * ⚠️ This is the SEVENTH per-view request the dashboard makes, against the
 * API's `short` throttle of 10 per second — the count `dashboard/page.tsx` has
 * been keeping since its sixth. That is headroom, not comfort, and the page has
 * been taken down once already by exactly this class of failure: an added read
 * on the busiest authenticated path, answered 429, thrown through the API
 * helper into «This page couldn't load».
 *
 * So a miss degrades to `{ exams: [] }` — which is the SAME value a student
 * with no scheduled exam produces, and both `<ExamCountdownBand>` and
 * `<MonthlyExamsSection>` render nothing at all for it. The dashboard then
 * looks exactly as it did before this feature existed, which is the standard
 * the page holds every added read to.
 *
 * `serverTime` is filled with this machine's clock rather than left blank
 * because the type demands a string, and it is never read: nothing renders on
 * an empty list, and the countdown is the only thing that would consume it.
 *
 * The `try` is inside rather than at the call site so no future caller can
 * forget it — the same placement, for the same reason, as `getMasteryOrNull`.
 *
 * Server Components / Server Actions only: `apiGetAuthed` reads `cookies()`.
 */
export const getStudentExamsOrEmpty = cache(async function getStudentExamsOrEmpty(): Promise<StudentExams> {
  try {
    return await apiGetAuthed('/api/me/exams', StudentExamsSchema);
  } catch {
    return { exams: [], serverTime: new Date().toISOString() };
  }
});

/**
 * The ONE exam the countdown band gets, out of everything the student is
 * enrolled in — or `null` when the band should not render at all.
 *
 * ## Why `open` beats `upcoming` rather than "soonest wins"
 *
 * A student in عربي and لغات can genuinely have two monthly exams in flight: one
 * whose window is open tonight and one announced for next week. The open one is
 * the only one of the pair with a door to walk through, so it takes the band
 * even when the other opens sooner — the band's whole job in that phase is to
 * be the page's one action, and an action that is still five days away is not
 * one.
 *
 * ## Why a `closed` exam can never be picked
 *
 * `closed` is not in either branch, and that is the placement rule stated as
 * code: a finished exam leaves the dashboard's top entirely and lives on in
 * «امتحانات الشهر» down in the main column, with its score and its paper. A
 * band counting down to something that already happened is furniture.
 *
 * ## The ordering this leans on
 *
 * `ScheduledExamsService.forStudent` sorts `open` first, then `upcoming`
 * soonest-first, then `closed` newest-first — so the FIRST match in each group
 * is the right one and this needs no sort of its own. `StudentExams.exams`
 * documents that order as part of the contract, which is what makes leaning on
 * it safe rather than lucky.
 */
export function bandExam(exams: readonly StudentExam[]): StudentExam | null {
  return (
    exams.find((exam) => exam.phase === 'open') ??
    exams.find((exam) => exam.phase === 'upcoming') ??
    null
  );
}
