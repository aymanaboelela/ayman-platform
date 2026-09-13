import { copy } from '@ayman/contracts';

/**
 * `2` → «الصف الثاني بكالوريا».
 *
 * Extracted from `lib/agents/markdown-render.ts`, where it was private, the day
 * the JSON-LD needed it too. `courseJsonLd` had been publishing
 * `educationalLevel: 'البكالوريا — 2'` — a string no student has ever typed and
 * no consumer can match against «تانية بكالوريا», which is the phrase the
 * course's own title uses two fields away.
 *
 * ⚠️ Anything that is not 1 or 2 falls through to the third year rather than
 * throwing. The catalog's `year` is a taxonomy id constrained to 1–3 upstream,
 * and a structured-data builder is the wrong place to discover it isn't: a
 * thrown error here takes down a course page over a label.
 */
export function yearLabelAr(year: number): string {
  if (year === 1) return copy.years.year1;
  if (year === 2) return copy.years.year2;
  return copy.years.year3;
}
