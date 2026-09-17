import { copy, formatCopy } from '@ayman/contracts';
/**
 * EGP cents → a whole-pound Arabic string with Western digits — the same
 * `-u-nu-latn` convention `formatNotificationTime` and `devices-list.tsx` use
 * for every other number on the platform, so a price does not read in a
 * different digit system from the timestamp next to it.
 */
const formatter = new Intl.NumberFormat('ar-EG-u-nu-latn', { maximumFractionDigits: 0 });

export function formatEGP(cents: number): string {
  return formatter.format(cents / 100);
}

/**
 * The same thing, but never rounding the piastres away.
 *
 * For the ACCOUNTS screens only. `formatEGP` above drops fractions on purpose:
 * a course price is a whole number of pounds and «٢٥٠٫٠٠ ج» on a card is noise.
 * A ledger is the opposite case — `/admin/finance` prints several figures that
 * are meant to add up, and rounding each of them independently makes the
 * arithmetic visibly wrong: three tiles at «x.5» each round up, and the total
 * the reader computes from the screen disagrees with the total the screen
 * shows, on the one page whose entire job is arithmetic.
 *
 * `maximumFractionDigits: 2` and not `minimumFractionDigits: 2` — a figure with
 * no piastres still renders as a bare «١٬٢٠٠», exactly as before. Only a figure
 * that actually has fractions grows, which is precisely when hiding them lies.
 */
const exactFormatter = new Intl.NumberFormat('ar-EG-u-nu-latn', { maximumFractionDigits: 2 });

export function formatEGPExact(cents: number): string {
  return exactFormatter.format(cents / 100);
}

/**
 * The shipping fee as it appears in a price BREAKDOWN — the basket's «الشحن»
 * row, and the identical row in the course page's «اطلب الكتاب» summary.
 *
 * A zero fee is a real, chosen configuration («مصاريف الشحن ملهاش دعوة… السعر
 * ٢٥٠»), not an empty value, and `formatEGP(0)` renders it as a bare «0» next
 * to a «جنيه» — which reads as a number that failed to load rather than as
 * free delivery. So zero gets a word.
 *
 * A function rather than a ternary at each call site because there are three of
 * them and they must not disagree: a basket that says «مجانًا» beside a
 * checkout summary that says «0» is the kind of mismatch that makes a reader
 * stop trusting the total.
 */
export function formatShipping(cents: number, freeLabel: string): string {
  return cents === 0 ? freeLabel : formatEGP(cents);
}

/**
 * Is this course free — no subscription plan on sale at any length.
 *
 * All THREE plans, because a course priced only by the year is not "free with
 * a yearly option": the student cannot get in without paying for something.
 * The card's own «مجاني بالكامل» badge is drawn from exactly this condition
 * (`priceBadge` falls through to it after checking the same three fields), so
 * the «المجاني بس» filter and the badge cannot disagree about which cards it
 * should leave on screen.
 *
 * ⚠️ The BOOK price is deliberately not consulted. A free course can sell a
 * printed book — see `CatalogCourse.bookPriceCents`'s own note — and dropping
 * such a course from «المجاني بس» would hide a course a student can take for
 * nothing because of an object they do not have to buy.
 */
export function isFreeCourse(course: {
  monthlyPriceCents: number | null;
  quarterlyPriceCents: number | null;
  yearlyPriceCents: number | null;
}): boolean {
  return (
    course.monthlyPriceCents === null &&
    course.quarterlyPriceCents === null &&
    course.yearlyPriceCents === null
  );
}

/**
 * The cheapest way in, as the card's badge phrases it — «١٥٠ ج / الشهر», or
 * «مجاني بالكامل» when nothing is on sale.
 *
 * ## Why it moved out of `course-card.tsx`
 *
 * Because the card was the only surface that had it. Every machine-readable
 * index — `/courses.md`, all three `/years/*.md`, `/llms.txt` and the WebMCP
 * `search_courses` tool — rendered the free foundation course in exactly the
 * same shape as the 150 ج/شهر ones, so «الكورس بكام؟» and «فيه حاجة أجربها من
 * غير فلوس؟» could not be answered from any of them. The HTML page even lets a
 * human FILTER for free courses while the markdown twin of that same page
 * could not tell them apart.
 *
 * The ladder is monthly → quarterly → yearly → free, not a list of every plan:
 * a badge answers "from how much", and the course page states the rest.
 *
 * ⚠️ `CatalogCourse` carries no `terms`, so a course sold ONLY by the term
 * reads as free here. That is not new exposure — the card and
 * `courseListJsonLd` have always had it — but it is the reason this must not
 * become the site's definition of "free": `isFreeCourse` below stays the one
 * the «المجاني بس» filter uses, and the detail page computes its own `priced`
 * with the terms in hand.
 */
export function coursePriceBadge(course: {
  monthlyPriceCents: number | null;
  quarterlyPriceCents: number | null;
  yearlyPriceCents: number | null;
}): string {
  if (course.monthlyPriceCents !== null) {
    return formatCopy(copy.course.priceMonthly, { price: formatEGP(course.monthlyPriceCents) });
  }
  if (course.quarterlyPriceCents !== null) {
    return formatCopy(copy.course.priceQuarterly, { price: formatEGP(course.quarterlyPriceCents) });
  }
  if (course.yearlyPriceCents !== null) {
    return formatCopy(copy.course.priceYearly, { price: formatEGP(course.yearlyPriceCents) });
  }
  // The LIST page's own word, not the detail page's sentence — a second
  // wording of one fact is a wording that will drift.
  return copy.landing.courseFree;
}
