import { PRACTICE_TRACKS, type PracticeTrack } from '@ayman/contracts/practice';

/**
 * The order every practice list is shown in: year, then track (عربي before
 * لغات, the contract's own order), then unit, then lesson — NUMERICALLY.
 *
 * ⚠️ Not `ORDER BY lesson_code`. The code is text, and text puts «6-10» before
 * «6-8» and «10-1» before «2-1». The list is a few dozen rows read once per
 * cached page, so sorting here costs nothing and keeps the rule in one place
 * a unit test can pin.
 */

interface Sortable {
  year: number;
  track: PracticeTrack;
  lessonCode: string;
}

/** «6-10» → [6, 10]. A code the contract regex never admits sorts last. */
export function parseLessonCode(code: string): [number, number] {
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(code.trim());
  if (!match) return [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
  return [Number(match[1]), Number(match[2])];
}

export function comparePracticeSets(a: Sortable, b: Sortable): number {
  if (a.year !== b.year) return a.year - b.year;
  const track = PRACTICE_TRACKS.indexOf(a.track) - PRACTICE_TRACKS.indexOf(b.track);
  if (track !== 0) return track;
  const [aUnit, aLesson] = parseLessonCode(a.lessonCode);
  const [bUnit, bLesson] = parseLessonCode(b.lessonCode);
  if (aUnit !== bUnit) return aUnit - bUnit;
  if (aLesson !== bLesson) return aLesson - bLesson;
  // Total order even for two codes that parse alike («2-01» vs «2-1»).
  return a.lessonCode < b.lessonCode ? -1 : a.lessonCode > b.lessonCode ? 1 : 0;
}

export function sortPracticeSets<T extends Sortable>(rows: readonly T[]): T[] {
  return [...rows].sort(comparePracticeSets);
}

/**
 * A reorder must name every question of the set exactly once — a missing id
 * would leave a question with a stale position colliding with a renumbered
 * one, and a foreign id would move a question out of another set's order.
 */
export function isExactPermutation(current: readonly string[], proposed: readonly string[]): boolean {
  if (current.length !== proposed.length) return false;
  const wanted = new Set(proposed);
  if (wanted.size !== proposed.length) return false;
  return current.every((id) => wanted.has(id));
}
