import { activeSalePrice } from '@ayman/contracts/sale';
import { isFeatureEnabled } from '../../common/entitlements';

/**
 * «عرض» on the API side — see `Course.saleMonthlyPriceCents`.
 *
 * Everything that prices a plan (the claim, the wallet, the coupon quote, an
 * admin recording a transfer) and everything that publishes one (the catalog)
 * reads the sale through here, and here through `activeSalePrice` — the same
 * function the web draws the card with.
 */

export type SaleCourse = {
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  saleMonthlyPriceCents: number | null;
  saleYearlyPriceCents: number | null;
  saleEndsAt: Date | null;
};

/** Nothing is on sale on a stack without the feature, whatever the columns say. */
function saleOn(): boolean {
  return isFeatureEnabled('courseSale');
}

/**
 * What this plan costs right now: the live sale price when there is one, the
 * regular price (`regularCents`, already resolved by `resolvePlanPriceCents`)
 * otherwise. `null` stays `null` — a plan not sold is not sold on offer either.
 *
 * Month, term and year. «٣ شهور» is off the shelf and only ever charges its
 * one price.
 */
export function chargedPlanPriceCents(
  course: SaleCourse,
  plan: 'monthly' | 'quarterly' | 'yearly' | 'term',
  term: { priceCents: number | null; salePriceCents: number | null } | null,
  regularCents: number | null,
  now: Date = new Date(),
): number | null {
  if (regularCents === null || !saleOn()) return regularCents;
  const sale =
    plan === 'monthly'
      ? activeSalePrice(course.monthlyPriceCents, course.saleMonthlyPriceCents, course.saleEndsAt, now)
      : plan === 'yearly'
        ? activeSalePrice(course.yearlyPriceCents, course.saleYearlyPriceCents, course.saleEndsAt, now)
        : plan === 'term' && term !== null
          ? activeSalePrice(term.priceCents, term.salePriceCents, course.saleEndsAt, now)
          : null;
  return sale ?? regularCents;
}

/**
 * The sale as the public catalog publishes it — only a LIVE one, so a sale
 * that ended is not advertised by an API answering fresh. `saleEndsAt` is
 * published with it because the web caches the catalog and has to stop
 * drawing the offer the moment it ends, not when the cache does.
 */
export function publicSale(
  course: SaleCourse,
  now: Date = new Date(),
): { saleMonthlyPriceCents: number | null; saleYearlyPriceCents: number | null; saleEndsAt: string | null } {
  const monthly = saleOn()
    ? activeSalePrice(course.monthlyPriceCents, course.saleMonthlyPriceCents, course.saleEndsAt, now)
    : null;
  const yearly = saleOn()
    ? activeSalePrice(course.yearlyPriceCents, course.saleYearlyPriceCents, course.saleEndsAt, now)
    : null;
  return {
    saleMonthlyPriceCents: monthly,
    saleYearlyPriceCents: yearly,
    saleEndsAt: course.saleEndsAt?.toISOString() ?? null,
  };
}

/** A term's live sale price for the catalog — `null` when there is none. */
export function publicTermSale(
  course: Pick<SaleCourse, 'saleEndsAt'>,
  term: { priceCents: number | null; salePriceCents: number | null },
  now: Date = new Date(),
): number | null {
  return saleOn() ? activeSalePrice(term.priceCents, term.salePriceCents, course.saleEndsAt, now) : null;
}
