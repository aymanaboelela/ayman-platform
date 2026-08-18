import { copy } from '@ayman/contracts/copy';
import type { CatalogCourse } from '@ayman/contracts/catalog';

export type CourseGroup = {
  /** The subject's Arabic name — the heading, and the key. */
  subject: string;
  courses: CatalogCourse[];
};

/**
 * A year's courses, split into the categories a student actually thinks in.
 *
 * `/years/[year]` used to render one flat grid inside one tinted panel. With
 * the catalogue at a single published course that meant one card floating in
 * the middle of a box most of a screen wide — «يبقى الكورسات جنب بعض» — and
 * with a full year of them it would have meant twenty cards in a row with
 * nothing saying where البرمجة ends and قواعد البيانات begins.
 *
 * ⚠️ GROUPED BY SUBJECT, NOT BY TRACK. Both are on `CatalogCourse` and the
 * track reads like the more specific label, but a year page has already fixed
 * the year and very nearly fixes the track with it — every published course
 * today is «مسار الهندسة وعلوم الحاسب», so grouping on it would produce exactly
 * one group forever and the headings would be noise. The subject is the axis
 * that actually varies within a year, and it is the word a student uses for
 * «المادة».
 *
 * ⚠️ ORDER IS FIRST APPEARANCE, not alphabetical. The API returns the catalogue
 * already sorted, and `Subject`/`SubjectOffering` carry a `sortOrder` that the
 * curriculum is meant to be read in. Sorting the groups by name here would
 * throw that away and put قواعد البيانات before البرمجة because of a letter.
 * A `Map` preserves insertion order for string keys, which is the whole reason
 * one is used instead of a plain object.
 */
export function groupBySubject(courses: readonly CatalogCourse[]): CourseGroup[] {
  const groups = new Map<string, CatalogCourse[]>();

  for (const course of courses) {
    const existing = groups.get(course.subjectNameAr);
    if (existing) existing.push(course);
    else groups.set(course.subjectNameAr, [course]);
  }

  return [...groups].map(([subject, list]) => ({ subject, courses: list }));
}

/**
 * «كورس واحد» / «كورسين» / «٣ كورسات» / «١١ كورس».
 *
 * Arabic counts in four forms, and the naive `${n} ${noun}` the rest of this
 * surface uses for lesson counts («3 محاضرة») is wrong in three of them. It is
 * tolerable in small mono metadata under a card; it is not tolerable in the
 * chip beside a section heading, which is set at reading size next to the
 * subject's name.
 *
 * ⚠️ 1 and 2 carry NO numeral — «كورس واحد», not «١ كورس واحد». That is the
 * whole reason this returns a string instead of a suffix the caller
 * interpolates a number in front of.
 *
 * Western digits, matching the rest of the catalogue («3 محاضرة», «1 ساعة 51
 * دقيقة»). Mixing Arabic-Indic numerals into one card and Western into the
 * next is more jarring than either choice on its own.
 */
export function courseCountLabel(count: number): string {
  const c = copy.years;
  if (count === 1) return c.countOne;
  if (count === 2) return c.countTwo;
  if (count >= 3 && count <= 10) return `${count} ${c.countFew}`;
  return `${count} ${c.countMany}`;
}
