import type { CatalogCourse, CatalogCourseDetail } from '@ayman/contracts/catalog';
import { activeSalePrice } from '@ayman/contracts/sale';

/**
 * What the guide may OFFER, derived from what the API actually published.
 *
 * Nothing in this file is a price, a year or a month of its own: every option
 * is read off the live catalogue payload, the same one the checkout reads when
 * it opens. A course without a plan does not get that row; a year with one
 * stream does not get the stream question.
 *
 * ⚠️ `planOptions` mirrors the derivation at the top of `SubscribePanel`
 * (`components/site/subscribe-panel.tsx`, «The live answer where there is
 * one») on purpose and line for line — `monthlyOnSale`, then `activeSalePrice`
 * for the offer, terms one by one. The guide only SHOWS these numbers; the
 * panel re-reads them and the server charges by its own. But a row here that
 * the panel would not draw is a promise the checkout breaks one screen later,
 * so a change to either derivation belongs in both. `guide-options.test.ts`
 * pins the cases that have gone wrong before.
 */

export type Stream = 'general' | 'languages';

/** One answer to «which year?» — a system and a year the catalogue teaches. */
export interface YearOption {
  /** `system:year` — what the selection stores. */
  key: string;
  systemSlug: string;
  year: number;
  label: string;
}

export function yearKeyOf(course: { systemSlug: string; year: number }): string {
  return `${course.systemSlug}:${course.year}`;
}

/**
 * The years on offer: one per (system, year) that has a published course.
 * `labelOf` is the stack's own wording for it (`lib/year-label`, or the
 * stack's grades), passed in so this file stays free of the copy table.
 */
export function yearOptions(
  courses: readonly CatalogCourse[],
  labelOf: (course: { systemSlug: string; year: number }) => string,
): YearOption[] {
  const seen = new Map<string, YearOption>();
  for (const course of courses) {
    const key = yearKeyOf(course);
    if (!seen.has(key)) {
      seen.set(key, { key, systemSlug: course.systemSlug, year: course.year, label: labelOf(course) });
    }
  }
  return [...seen.values()].sort(
    (a, b) => a.year - b.year || a.systemSlug.localeCompare(b.systemSlug),
  );
}

/** The streams the chosen year's courses serve — «عربي» first. */
export function streamOptions(courses: readonly CatalogCourse[], yearKey: string | null): Stream[] {
  if (yearKey === null) return [];
  const inYear = courses.filter((course) => yearKeyOf(course) === yearKey);
  const out: Stream[] = [];
  if (inYear.some((course) => course.forGeneral)) out.push('general');
  if (inYear.some((course) => course.forLanguages)) out.push('languages');
  return out;
}

/** A course the list payload already says can be paid for. */
function hasListedPrice(course: CatalogCourse): boolean {
  return (
    (course.monthlyPriceCents !== null && course.monthlyOnSale !== false) ||
    course.yearlyPriceCents !== null
  );
}

/**
 * The most rows the course step lists. A year normally has one course per
 * stream; past a handful the step stops being a question and becomes a
 * catalogue, and the catalogue already exists.
 */
export const MAX_COURSES = 6;

/**
 * The courses for a year and a stream, the likeliest first.
 *
 * NOT filtered by price, deliberately: the list payload carries the monthly
 * and yearly prices but not the terms, so «no price here» cannot tell a free
 * course from one sold by term alone — and hiding the second kind is a lost
 * sale. Ranked instead: a listed price first, then a course that has lessons,
 * then the newest.
 */
export function coursesFor(
  courses: readonly CatalogCourse[],
  yearKey: string | null,
  stream: Stream | null,
): CatalogCourse[] {
  if (yearKey === null) return [];
  const rank = (course: CatalogCourse) => (hasListedPrice(course) ? 2 : 0) + (course.lessonCount > 0 ? 1 : 0);
  return courses
    .filter((course) => yearKeyOf(course) === yearKey)
    .filter((course) =>
      stream === null ? true : stream === 'general' ? course.forGeneral : course.forLanguages,
    )
    .sort((a, b) => rank(b) - rank(a) || b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, MAX_COURSES);
}

/** One row of «which package?». `wasCents` is the regular price during an offer. */
export type PlanOption =
  | { id: 'monthly'; kind: 'monthly'; priceCents: number; wasCents: number | null; byMonth: boolean }
  | { id: string; kind: 'term'; termId: string; title: string; priceCents: number; wasCents: number | null }
  | { id: 'yearly'; kind: 'yearly'; priceCents: number; wasCents: number | null };

/**
 * What this student already holds in the course —
 * `GET /api/payments/courses/:id/months/mine`, the same read the checkout
 * makes before it draws its month picker. `null` for a visitor, and for a
 * read that failed: both mean «nothing known to be owned», which is what the
 * panel assumes too, and the server refuses a month that is already held.
 */
export interface Owned {
  ownedMonthIds: readonly string[];
  /** A term, a year or a grant — every month is already open. */
  coversAll: boolean;
  /** A claim for this course is waiting in the review queue. */
  pending: boolean;
}

/** The open months of the course this student does not already hold. */
function buyableMonths(course: CatalogCourseDetail, owned: Owned | null) {
  return course.months.filter((month) => !owned?.ownedMonthIds.includes(month.id));
}

/**
 * The ways to subscribe, in ONE fixed order: «شهر», then every term on sale
 * in the instructor's own order, then the whole year. (Terms that are not on
 * sale yet are `upcomingTerms` below — listed after these, never selectable.)
 */
export function planOptions(course: CatalogCourseDetail, owned: Owned | null = null, now?: Date): PlanOption[] {
  const out: PlanOption[] = [];
  const saleEndsAt = course.saleEndsAt ?? null;
  const byMonth = course.months.length > 0;

  // «شهر» only while a month can actually be bought: a course sold by
  // curriculum month with every month closed keeps its price and loses the
  // row — and so does a student every open month is already open to, exactly
  // as the checkout drops its own «شهر» card (`monthCardCovered`).
  const nothingLeft = byMonth && (owned?.coversAll === true || buyableMonths(course, owned).length === 0);
  const regularMonthly = course.monthlyOnSale !== false && !nothingLeft ? course.monthlyPriceCents : null;
  if (regularMonthly !== null) {
    const sale = activeSalePrice(regularMonthly, course.saleMonthlyPriceCents, saleEndsAt, now);
    out.push({
      id: 'monthly',
      kind: 'monthly',
      priceCents: sale ?? regularMonthly,
      wasCents: sale !== null ? regularMonthly : null,
      byMonth,
    });
  }

  for (const term of course.terms) {
    const sale = activeSalePrice(term.priceCents, term.salePriceCents, saleEndsAt, now);
    out.push({
      id: `term:${term.id}`,
      kind: 'term',
      termId: term.id,
      title: term.title,
      priceCents: sale ?? term.priceCents,
      wasCents: sale !== null ? term.priceCents : null,
    });
  }

  if (course.yearlyPriceCents !== null) {
    const sale = activeSalePrice(course.yearlyPriceCents, course.saleYearlyPriceCents, saleEndsAt, now);
    out.push({
      id: 'yearly',
      kind: 'yearly',
      priceCents: sale ?? course.yearlyPriceCents,
      wasCents: sale !== null ? course.yearlyPriceCents : null,
    });
  }

  return out;
}

/**
 * A term that exists and is not on sale yet — «الترم التاني» while the first
 * is running. A name to show, greyed out, under «لسه ما اتفتحش»; it has no
 * price, cannot be chosen, and never reaches a checkout link.
 *
 * The API decides which terms these are (`CatalogService.upcomingTerms`), and
 * an API that predates the field sends none.
 */
export interface UpcomingTerm {
  id: string;
  title: string;
}

export function upcomingTerms(course: CatalogCourseDetail): UpcomingTerm[] {
  const onSale = new Set(course.terms.map((term) => term.id));
  // Belt and braces: a term the payload lists as on sale is never ALSO drawn
  // as closed, whatever the two lists say.
  return (course.upcomingTerms ?? []).filter((term) => !onSale.has(term.id));
}

/** One row of «which months?» — an OPEN curriculum month, at today's price. */
export interface MonthOption {
  id: string;
  title: string;
  lessonCount: number;
  priceCents: number;
}

/**
 * The months to choose from, in curriculum order — empty unless «شهر» on this
 * course means named months.
 *
 * Only months that can be BOUGHT: the payload carries the open ones and
 * nothing else (a closed month is not published at all), and a month this
 * student already holds is dropped here. So nothing on this list can be
 * refused by the checkout for being closed or owned.
 *
 * One price for any month, so an offer's monthly price is every month's price
 * (the panel does the same to its own rows).
 */
export function monthOptions(
  course: CatalogCourseDetail,
  plan: PlanOption | null,
  owned: Owned | null = null,
): MonthOption[] {
  if (plan?.kind !== 'monthly' || !plan.byMonth) return [];
  const onOffer = plan.wasCents !== null;
  return buyableMonths(course, owned)
    .sort((a, b) => a.monthIndex - b.monthIndex)
    .map((month) => ({
      id: month.id,
      title: month.title,
      lessonCount: month.lessonCount,
      priceCents: onOffer ? plan.priceCents : month.priceCents,
    }));
}

/**
 * What the chosen package costs — `null` until it is whole.
 *
 * Several months are the SUM of the chosen rows' own prices, not «count ×
 * the monthly price». Today the two agree to the piastre (the API fills every
 * month from the course's one monthly price); they stop agreeing the day a
 * month gets a price of its own, and this is already reading the rows the
 * server will charge from — the same choice `selectedMonthsTotalCents` makes
 * in the checkout.
 */
export function totalCents(plan: PlanOption | null, months: readonly MonthOption[]): number | null {
  if (!plan) return null;
  if (plan.kind === 'monthly' && plan.byMonth) {
    return months.length > 0 ? months.reduce((sum, month) => sum + month.priceCents, 0) : null;
  }
  return plan.priceCents;
}

/**
 * Where the choices are handed over: the platform's own checkout, opened on
 * what was picked.
 *
 * `?month=a,b` is the link the lecture padlock and the «شهور جديدة اتفتحت»
 * card already use — one id or a comma list, and the panel opens on its month
 * picker with exactly those ticked. `?plan=` (and `?term=`) is its sibling for
 * the other three purchases. Both are read and
 * re-validated by `SubscribePanel` against a live read — an id that is no
 * longer on sale just opens the ordinary plan grid — so nothing here is
 * trusted, least of all a price, which is not in the URL at all.
 *
 * No plan (a course with nothing on sale) goes to the course page instead.
 */
export function checkoutHref(slug: string, plan: PlanOption | null, months: readonly MonthOption[]): string {
  const base = `/courses/${encodeURIComponent(slug)}`;
  if (!plan) return base;
  if (plan.kind === 'monthly' && plan.byMonth && months.length > 0) {
    // Written by hand, not through `URLSearchParams`: that would encode the
    // commas (`%2C`). The panel decodes either, but this is the exact shape of
    // the links already in the product, and one shape is easier to grep for.
    return `${base}/subscribe?month=${months.map((month) => month.id).join(',')}`;
  }
  const query = new URLSearchParams({ plan: plan.kind });
  if (plan.kind === 'term') query.set('term', plan.termId);
  return `${base}/subscribe?${query.toString()}`;
}
