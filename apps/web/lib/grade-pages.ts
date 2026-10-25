import type { Grade } from '@ayman/contracts/grades';
import { copy } from '@ayman/contracts';
import { ASKS_GRADE, TENANT_GRADES } from '@/lib/tenant-grades';
import { yearAliasesAr, yearLabelAr } from '@/lib/year-label';
import { isYearIndexable } from '@/lib/seo/year-visibility';

/**
 * The public year pages — `/years/[year]` — on a stack with grades and on
 * every other.
 *
 * ## Why the segment becomes a grade slug there
 *
 * `/years/1` is «الصف الأول» and nothing more on a secondary-only stack. On
 * a stack teaching الإعدادية AND الصف الأول الثانوي, year 1 is two grades, and
 * a page for the number would put «أولى إعدادي» courses under the heading of
 * «أولى ثانوي» (or the other way round). So there the segment is the grade's
 * own slug — `/years/prep1`, `/years/sec1` — and the numbers 404. Every other
 * stack keeps `/years/1..3` byte-identically: none of this runs unless
 * `TENANT_GRADES` is set.
 */

export interface YearPage {
  /** The URL segment: `2`, or `prep3`. */
  segment: string;
  /** «الصف الثاني بكالوريا», or «الصف الثالث الإعدادي». */
  title: string;
  /** The spellings a student types — `alternateName` and the description. */
  aliases: readonly string[];
  /** Whether a course is one of this page's. */
  matches: (course: { systemSlug: string; year: number }) => boolean;
  /** The number, for the helpers keyed on it (the foundation course) — null on a grade page. */
  year: number | null;
}

const SPOKEN = [
  ['أولى', 'اولى', '١', '1'],
  ['تانية', 'ثانية', '٢', '2'],
  ['تالتة', 'ثالثة', '٣', '3'],
] as const;

function gradeAliases(grade: Grade): readonly string[] {
  const stage = grade.system === 'preparatory' ? 'إعدادي' : grade.system === 'bacalorya' ? 'بكالوريا' : 'ثانوي';
  const bare = stage === 'إعدادي' ? 'اعدادي' : stage;
  const [word, plain, indic, ascii] = SPOKEN[grade.year - 1]!;
  return [grade.labelAr, `${word} ${stage}`, `${plain} ${bare}`, `${indic} ${stage}`, `${ascii} ${stage}`];
}

function gradePage(grade: Grade): YearPage {
  return {
    segment: grade.slug,
    title: grade.labelAr,
    aliases: gradeAliases(grade),
    matches: (course) => course.systemSlug === grade.system && course.year === grade.year,
    year: null,
  };
}

function numberPage(year: number): YearPage {
  return {
    segment: String(year),
    title: yearLabelAr(year),
    aliases: yearAliasesAr(year),
    matches: (course) => course.year === year,
    year,
  };
}

/** Every year page this stack has, in order. */
export function yearPages(): YearPage[] {
  return ASKS_GRADE ? TENANT_GRADES.map(gradePage) : [1, 2, 3].map(numberPage);
}

/** The page a URL segment names, or null for a 404. */
export function yearPageOf(raw: string): YearPage | null {
  if (ASKS_GRADE) {
    const grade = TENANT_GRADES.find((g) => g.slug === raw);
    return grade ? gradePage(grade) : null;
  }
  // `Number('')` is 0 and `Number(' 1 ')` is 1 — neither is a valid segment,
  // so the shape is checked before the value.
  return /^[123]$/.test(raw) ? numberPage(Number(raw)) : null;
}

/** `isYearIndexable` for a page — the same rule, by the page's own predicate. */
export function isYearPageIndexable(
  courses: readonly { systemSlug: string; year: number }[],
  page: YearPage,
): boolean {
  if (page.year !== null) return isYearIndexable(courses, page.year);
  return courses.length === 0 || courses.some(page.matches);
}

/**
 * A course as these helpers need it. `systemSlug` is on every catalog row;
 * the JSON-LD builders carry only the system's NAME, so that is matched too —
 * the seeded names, which `/admin/taxonomy/systems` could rename, in which
 * case the label falls back to the number's (the old behaviour) rather than
 * guessing.
 */
type CourseYear = { systemSlug?: string; systemNameAr?: string; year: number };

const SEEDED_SYSTEM_NAMES: Record<string, string> = {
  preparatory: 'المرحلة الإعدادية',
  thanaweya_amma: 'الثانوية العامة',
  bacalorya: 'البكالوريا المصرية',
};

function courseGrade(course: CourseYear): Grade | undefined {
  if (!ASKS_GRADE) return undefined;
  return TENANT_GRADES.find(
    (g) =>
      g.year === course.year &&
      (course.systemSlug !== undefined
        ? course.systemSlug === g.system
        : course.systemNameAr === SEEDED_SYSTEM_NAMES[g.system]),
  );
}

/**
 * A course's year as a reader should see it — «الصف الأول الإعدادي» on a
 * stack with grades, `yearLabelAr` (the stack's historical spelling)
 * everywhere else.
 */
export function courseYearLabel(course: CourseYear): string {
  return courseGrade(course)?.labelAr ?? yearLabelAr(course.year);
}

/** The title prefix every year page carries — «كورسات». */
export const YEAR_PAGE_PREFIX = copy.years.title;

/** `yearAliasesAr` for a course — its grade's spellings on a stack with grades. */
export function courseYearAliases(course: CourseYear): readonly string[] {
  const grade = courseGrade(course);
  return grade ? gradeAliases(grade) : yearAliasesAr(course.year);
}
