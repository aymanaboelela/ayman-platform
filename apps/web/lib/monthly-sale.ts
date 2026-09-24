/**
 * The monthly price AS SOLD — `null` when the plan cannot be bought right now.
 *
 * `monthlyOnSale` is `false` on a course sold by curriculum month with every
 * month closed: the price still stands (the course is still paid), but there
 * is no month to buy. Every «can this be BOUGHT?» reading on the web goes
 * through here; every «is this course paid / free?» reading keeps reading
 * `monthlyPriceCents` itself — nulling the price for that question turned a
 * closed monthly-only course into a FREE one on the course page.
 *
 * `=== false`, never truthiness: a payload from before the field existed (an
 * older API mid-deploy, a cached entry, a stale tab's schema stripping the
 * key) must read as on sale, the behaviour before this existed.
 *
 * A NEW module rather than more of `lib/price.ts`, which client components
 * import — a module a previous build already shipped must not gain exports.
 */
export function monthlyForSaleCents(course: {
  monthlyPriceCents: number | null;
  monthlyOnSale?: boolean;
}): number | null {
  return course.monthlyOnSale === false ? null : course.monthlyPriceCents;
}
