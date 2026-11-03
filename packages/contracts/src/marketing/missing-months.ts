/**
 * «ناقصه شهور» — which open months of a course a student does not hold, and
 * how that reads inside a WhatsApp message.
 *
 * ## The rule is `monthSliceOf`'s, restated over plain data
 *
 * A live `course` / `term` grant covers every month (a year subscriber is a
 * `course` grant with an end date); a live `course_month` grant covers its one
 * month. The API reduces the grants with `monthSliceOf` and hands this file
 * the result, so the audience, the message and the padlock agree about who
 * holds what. Only OPEN months count as missing: a closed month is not on sale,
 * and «ناقصك الشهر الرابع» about a month the student cannot buy is a message
 * that ends in a refusal.
 *
 * ## Words, not digits
 *
 * «الشهر التاني والتالت», the way the instructor says it, not «شهر ٢ و٣».
 * The ordinals are the spoken Egyptian ones (التاني، التالت، التامن) and the
 * phrase is about MONTHS — never about the reader — so it has no gender to get
 * wrong.
 *
 * No relative imports — same rule as every other leaf module in this package.
 */

/** Per recipient: the months still to buy, e.g. «الشهر التاني والتالت». */
export const MISSING_MONTHS_TOKEN = '{{الشهور_الناقصة}}';

const ORDINALS = [
  'الأول',
  'التاني',
  'التالت',
  'الرابع',
  'الخامس',
  'السادس',
  'السابع',
  'التامن',
  'التاسع',
  'العاشر',
  'الحداشر',
  'الاتناشر',
] as const;

/** «الشهور التلاتة» — the count words for «all of them», 3 and up. */
const COUNTS: Record<number, string> = {
  3: 'التلاتة',
  4: 'الأربعة',
  5: 'الخمسة',
  6: 'الستة',
  7: 'السبعة',
  8: 'التمانية',
  9: 'التسعة',
  10: 'العشرة',
};

function ordinal(monthIndex: number): string {
  return ORDINALS[monthIndex - 1] ?? String(monthIndex);
}

/**
 * The phrase for `{{الشهور_الناقصة}}`.
 *
 * - every open month missing: «الشهر الأول» · «الشهرين» · «الشهور التلاتة»
 * - some of them: «الشهر التاني» · «الشهر التاني والتالت» ·
 *   «الشهر التاني والتالت والرابع»
 *
 * `missing` and `openCount` come from the same open-month list; an empty
 * `missing` is the empty string (the runner skips that student before this).
 */
export function missingMonthsPhrase(missing: readonly number[], openCount: number): string {
  const sorted = [...new Set(missing)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  if (sorted.length === openCount && openCount >= 2) {
    if (openCount === 2) return 'الشهرين';
    const count = COUNTS[openCount];
    if (count) return `الشهور ${count}`;
  }
  const [first, ...rest] = sorted.map(ordinal);
  return ['الشهر', [first, ...rest.map((word) => `و${word}`)].join(' ')].join(' ');
}
