// The PACKAGE SUBPATH, never `./progress` — hazard H3: `apps/api` imports this
// module for a runtime value, and a relative extensionless specifier throws
// ERR_MODULE_NOT_FOUND the moment the API boots. See `progress.ts`'s own note.
import { isVideoAutoComplete, type VideoProgressSnapshot } from '@ayman/contracts/progress';

/*
 * ## Why this is its own module and not a fourth helper in `progress.ts`
 *
 * `progress.ts` is loaded on the dashboard, the library and the player, so a
 * tab that outlived the deploy holds ITS factory from the old build — and
 * Turbopack keeps the first factory registered for an id (see `partial.ts`,
 * which learned this on production). A player chunk from the new build then
 * reads `isCompletionUndoable` off the OLD `progress` exports, gets
 * `undefined`, and the lesson page dies at render. A module that did not exist
 * before has no old factory to lose to.
 */

export interface UndoableCompletionFacts extends VideoProgressSnapshot {
  /** `Lesson.kind`. */
  kind: string;
  /** `LessonProgress.completedVia` — `null` on a lesson that is not complete. */
  completedVia: string | null;
}

/**
 * Whether «تم» on this lesson can be taken back — «في ناس بتضغط بالغلط».
 *
 * One tested sentence for both sides, the same as the thresholds in
 * `progress.ts`: the server refuses an undo this answers `false` for
 * (`LessonProgressService.undoManualCompletion`), and the player only draws
 * «تم» as a button when it answers `true`. The two disagreeing would mean a
 * dialog whose «أيوه» is a 400.
 *
 * Only a press of «خلاص · التالي» is the student's to withdraw — and even then
 * only on a VIDEO, and only while the video's own rule would not hand the
 * completion straight back:
 *
 *   · `auto`/`dwell` were EARNED, and a quiz is completed by passing it. None
 *     of those came from the button, so the button does not get to undo them.
 *   · A text or attachment lesson completes itself after five seconds on the
 *     page (`useDwellComplete`, armed by `!alreadyComplete`). Undoing a manual
 *     press there re-arms that timer, and the first dwell after it lands on a
 *     `first_opened_at` long past — so the lesson is «تم» again five seconds
 *     later, via `dwell`. A dialog promising «لسه ماخلصش» would be lying.
 *   · A video pressed early and then watched to the thresholds anyway already
 *     qualifies. The very next heartbeat would re-complete it as `auto`, so
 *     the same lie, one heartbeat later.
 */
export function isCompletionUndoable(facts: UndoableCompletionFacts): boolean {
  if (facts.completedVia !== 'manual') return false;
  if (facts.kind !== 'video') return false;
  return !isVideoAutoComplete(facts);
}
