/**
 * The name a curriculum month is BORN with — «الشهر الأول»، «الشهر التاني»…
 *
 * «وأنا بشترك في الكورس بيبقى فيه شهر 1 شهر 2، لا عاوز يبقى مكتوب الشهر الأول
 * الشهر الثاني الشهر الثالث». The old default was «شهر {n}», and a title is
 * stored, so every month made by «خلّي الكورس بالشهور» and «كمّل الشهور» kept
 * the number on the checkout the student reads.
 *
 * Only the default. `CourseMonth.title` stays free text and the instructor
 * renames it in place («الشهر الأول — أكتوبر»); nothing here reads a title
 * back. Migration `20260930180000_month_ordinal_titles` renamed the rows that
 * still held the old default FOR THEIR OWN INDEX — a month someone had
 * renamed is not touched.
 *
 * ⚠️ Its own module on purpose: a new export on an existing contracts module
 * breaks every tab still open on the previous build (Turbopack module ids).
 *
 * Fusha ordinals («الثاني»، «الثالث») rather than «التاني»: this is a label on
 * a price, the same register as «الترم الأول» on the term grants next to it.
 * 1..12 is the column's own CHECK (`course_months.month_index`).
 */
const ORDINALS = [
  'الأول',
  'الثاني',
  'الثالث',
  'الرابع',
  'الخامس',
  'السادس',
  'السابع',
  'الثامن',
  'التاسع',
  'العاشر',
  'الحادي عشر',
  'الثاني عشر',
] as const;

export function defaultMonthTitle(monthIndex: number): string {
  const ordinal = ORDINALS[monthIndex - 1];
  // Out of range cannot be stored (CHECK 1..12), but a label must never read
  // «الشهر undefined» if a caller passes one anyway.
  return ordinal ? `الشهر ${ordinal}` : `الشهر ${monthIndex}`;
}
