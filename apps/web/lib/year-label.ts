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

/**
 * Every way a student writes the year, for the year they mean.
 *
 * ⚠️ The DIGIT forms are the point of this list, and they are the ones that
 * were missing everywhere. «٢ بكالوريا» and «2 بكالوريا» are what a student
 * types — faster than «الصف الثاني بكالوريا», and far more common — and
 * nothing on this site contained either string. Not the page title, not the
 * course, not the structured data. A query with a digit in it matched a site
 * that only ever spelled the number out.
 *
 * ⚠️ BOTH digit sets, always. `٢` (U+0662, Arabic-Indic) and `2` (ASCII) are
 * different characters and a search engine does not reliably fold one into the
 * other on a proper-noun-ish phrase. An Egyptian phone keyboard produces
 * either depending on how it was set up, so shipping one of the two is
 * shipping half the queries.
 *
 * ⚠️ And both spellings of «تانية»/«ثانية». The colloquial ت is what is typed;
 * the classical ث is what a school writes. Neither is a misspelling to
 * normalise away.
 *
 * The FIRST entry is the canonical name — `yearLabelAr` above — and the rest
 * are alternates. Consumers that need one name take `[0]`; consumers that
 * publish an `alternateName` or a keyword list take the whole thing.
 *
 * ⚠️ These belong in `alternateName`, `keywords` and `educationalLevel` — the
 * fields whose job is "other names for this". They do not belong in a visible
 * heading. A line of comma-separated spellings on the page reads as keyword
 * stuffing to a reader and to a spam classifier, and both are right.
 */
const YEAR_ALIASES: Record<number, readonly string[]> = {
  1: [copy.years.year1, 'أولى بكالوريا', 'اولى بكالوريا', '١ بكالوريا', '1 بكالوريا'],
  2: [
    copy.years.year2,
    'تانية بكالوريا',
    'ثانية بكالوريا',
    'تانيه بكالوريا',
    '٢ بكالوريا',
    '2 بكالوريا',
  ],
  3: [copy.years.year3, 'تالتة بكالوريا', 'ثالثة بكالوريا', '٣ بكالوريا', '3 بكالوريا'],
};

export function yearAliasesAr(year: number): readonly string[] {
  return YEAR_ALIASES[year] ?? [yearLabelAr(year)];
}
