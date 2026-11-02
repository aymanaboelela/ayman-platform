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
 */
export function activeSalePrice(
  regularCents: number | null,
  saleCents: number | null | undefined,
  saleEndsAt: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (regularCents === null || saleCents == null || saleCents >= regularCents) return null;
  if (saleEndsAt != null && new Date(saleEndsAt).getTime() <= now.getTime()) return null;
  return saleCents;
}
