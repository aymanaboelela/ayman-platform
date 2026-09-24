/**
 * The pure rules behind buying «شهر من المنهج», split out of
 * `PaymentsService` for the same reason `payment-expiry.ts` was: the
 * arithmetic and the refusals are decidable without a database, and
 * `payments.service.spec.ts` only ever exercises the cases that happen to
 * fall out of a fixture course. The interesting ones here — a month that was
 * closed between the picker rendering and the student pressing «كمّل الدفع»,
 * a second claim for a month already under review — need states chosen on
 * purpose.
 *
 * Nothing here touches Prisma or Nest, and nothing reads the clock: liveness
 * is decided by `grant-liveness.ts` before a set of owned months ever reaches
 * this file.
 */

/**
 * Why a month selection was refused. A discriminated union and not a bare
 * string because the CALLER decides the HTTP shape, and because the refusal
 * carries WHICH months were wrong — a student who picked four months and had
 * one closed under them needs to know which one, not that "something" failed.
 */
export type MonthSelectionRefusal =
  | { kind: 'none_chosen' }
  | { kind: 'not_on_sale'; monthIds: string[] }
  | { kind: 'already_owned'; monthIds: string[] };

/**
 * `null` when this selection may be bought, a refusal otherwise.
 *
 * Order matters. `none_chosen` first because an empty list has no months to
 * say anything else about. `not_on_sale` before `already_owned` because it is
 * the stricter fact: an id naming a month of another course, a deleted month,
 * or one the instructor closed is wrong regardless of what the student holds,
 * and reporting it as "you already own this" would be a lie that sends them
 * to the wrong screen.
 *
 * `onSale` is the OPEN months of THIS course — the caller builds it from the
 * course's own rows, which is what makes "a month of another course" fail
 * here rather than at the composite FK with a 500.
 */
export function checkMonthSelection(params: {
  requested: readonly string[];
  onSale: ReadonlySet<string>;
  owned: ReadonlySet<string>;
}): MonthSelectionRefusal | null {
  if (params.requested.length === 0) return { kind: 'none_chosen' };

  const notOnSale = params.requested.filter((id) => !params.onSale.has(id));
  if (notOnSale.length > 0) return { kind: 'not_on_sale', monthIds: notOnSale };

  // Taking money for a month the student can already open is the one failure
  // mode here that costs them something real, and it is invisible: the grant
  // write is idempotent, so nothing downstream would ever complain.
  const alreadyOwned = params.requested.filter((id) => params.owned.has(id));
  if (alreadyOwned.length > 0) return { kind: 'already_owned', monthIds: alreadyOwned };

  return null;
}

/** English, like every other refusal `PaymentsService` throws — the Arabic
 *  the student reads is `copy.subscribe.*`, rendered by the panel that knows
 *  the month TITLES. Ids are useless to a reader and are left to the audit
 *  trail; the count is what makes the sentence specific enough to act on. */
export function monthSelectionMessage(refusal: MonthSelectionRefusal): string {
  switch (refusal.kind) {
    case 'none_chosen':
      return 'this course sells by curriculum month — pick at least one month to subscribe to';
    case 'not_on_sale':
      return `${refusal.monthIds.length} of the chosen months are not open for subscription on this course`;
    case 'already_owned':
      return `${refusal.monthIds.length} of the chosen months are already covered by a live subscription`;
  }
}

/**
 * Can the MONTHLY plan be bought right now — the one definition, shared by the
 * catalog (what the storefront offers) and `submit()` (what it accepts).
 *
 * A course with no curriculum months sells the old thirty-day plan whenever it
 * has a price. A course WITH months sells one month at a time, so with every
 * month closed there is nothing to buy: the storefront drew the «شهر» card
 * anyway, and the claim it sent was refused after the student had already
 * uploaded a transfer screenshot.
 *
 * ⚠️ This is «for sale», never «paid». A closed monthly-only course is still a
 * paid course; every «is it free?» reading keeps reading the price.
 */
export function monthlyPlanOnSale(
  monthlyPriceCents: number | null,
  months: { total: number; open: number },
): boolean {
  return monthlyPriceCents !== null && (months.total === 0 || months.open > 0);
}

/**
 * What one transfer for these months costs.
 *
 * One price for any month (`Course.monthlyPriceCents`) is the instructor's own
 * decision — `CourseMonth.priceCents` exists and is deliberately not read, see
 * its model doc. Multiplication and not a sum over per-month prices so that
 * changing that decision later is a visible edit here rather than a silent
 * behaviour change.
 */
export function monthPurchaseAmountCents(perMonthCents: number, monthCount: number): number {
  return perMonthCents * monthCount;
}

/**
 * Which pending claims stand in the way of this one — the month-aware
 * replacement for `submit()`'s blanket "one pending submission per course".
 *
 * ## Why the blanket rule had to be narrowed, and only here
 *
 * The course-wide guard exists because approval EXTENDS one grant: two
 * pending claims for the same course are two claims racing for the same seat,
 * and whichever is approved second silently adds a term nobody asked for.
 * None of that is true of months. Approval creates one grant PER MONTH, the
 * months are disjoint things, and «نسيت أشترك شهر ٢» while a claim for شهر ٣
 * is still under review is a real student with a real second transfer — the
 * old rule would tell them to wait for a review that has nothing to do with
 * what they are buying.
 *
 * What is still refused is the overlap: a pending claim that already names one
 * of these months is the same claim twice, and a pending claim that names NO
 * months at all (a term or yearly submission, or an old-model monthly one on a
 * course that has since gained months) covers everything this one would buy,
 * so it is the old race after all.
 */
export function pendingClaimsBlocking(
  pending: readonly { id: string; monthIds: readonly string[] }[],
  requested: readonly string[],
): string[] {
  const wanted = new Set(requested);
  return pending
    .filter(
      (claim) =>
        claim.monthIds.length === 0 || claim.monthIds.some((monthId) => wanted.has(monthId)),
    )
    .map((claim) => claim.id);
}
