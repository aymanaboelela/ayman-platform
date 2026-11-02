/**
 * «عرض» — is this plan's sale price live right now?
 *
 * ONE rule for both halves of a sale: `PaymentsService` charges from it and
 * the web draws from it. Two readings of «is the offer still on» would let
 * the card say ٩٩ while the claim asks ١٥٠ — or the reverse, after the date.
 *
 * Live when there is a sale price, it is below the regular one (the CHECKs
 * already insist, this only keeps a stale cached payload honest), and the
 * end date — if there is one — has not passed. `null` otherwise, and the
 * caller uses the regular price.
 *
 * `now: null` skips the date and trusts the source — for a server-rendered
 * page, which Next prerenders and which must not read the clock («encountered
 * the unstable value `new Date()` while prerendering»). That is safe because
 * the catalog API publishes an offer only while it is live; a cached page can
 * show an ended offer until it revalidates, and the checkout still charges by
 * the date. Omitted, the clock is read — lazily, only when there IS a date,
 * so a client render with nothing on offer never touches it either.
 */
export function activeSalePrice(
  regularCents: number | null,
  saleCents: number | null | undefined,
  saleEndsAt: Date | string | null | undefined,
  now?: Date | null,
): number | null {
  if (regularCents === null || saleCents == null || saleCents >= regularCents) return null;
  if (saleEndsAt != null && now !== null) {
    if (new Date(saleEndsAt).getTime() <= (now ?? new Date()).getTime()) return null;
  }
  return saleCents;
}
