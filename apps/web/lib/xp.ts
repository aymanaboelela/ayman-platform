/**
 * «نقاط الخبرة» — computed live, on every render.
 *
 * ## Nothing here is stored, and that is the design
 *
 * There is no `xp` column, no `xp_events` table, and no write path. The
 * figure is a pure function over data the dashboard has already fetched —
 * exactly the same rule `achievements.ts` documents for the badge strip, and
 * for the same reason: a persisted total is written once (or incrementally,
 * which is worse — it needs its own reconciliation job) and can drift from
 * what actually happened, while a recomputed one can only ever agree with the
 * payload it was built from.
 *
 * The trade-off is the same one `achievements.ts` accepts out loud: the
 * number can go BACKWARDS. Unenrol from a finished course and its 100 XP goes
 * with it. That is correct — at that moment the course is no longer complete,
 * and a number that never falls is not measuring anything current.
 *
 * `docs/superpowers/specs/2026-08-02-learning-path-design.md` argued against
 * any points economy at all, and that document is left exactly as written —
 * it is not wrong about what it warns against, a STORED, tradeable balance
 * that invites gaming. This is neither: it is read-only arithmetic, gone the
 * moment the thing that earned it is, which is a different feature wearing a
 * name the doc never ruled out.
 *
 * ## The formula
 *
 * 10 XP per completed lesson, 30 per passed quiz, 100 per finished course.
 * Chosen so the tiers separate visibly (a lesson is routine, a pass is a
 * result, a finished course is a milestone) rather than to model any real
 * unit — nothing downstream compares this number to anything external, so it
 * costs nothing to retune later if it reads too fast or too slow in practice.
 */
export function xpFor({
  completedLessons,
  passedQuizCount,
  completedCourseCount,
}: {
  completedLessons: number;
  passedQuizCount: number;
  completedCourseCount: number;
}): number {
  return completedLessons * 10 + passedQuizCount * 30 + completedCourseCount * 100;
}
