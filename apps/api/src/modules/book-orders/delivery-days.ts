/**
 * «هيوصلك خلال كام يوم» — ONE answer, for every surface that promises one.
 *
 * His own wording, tightened on 2026-09-07: «لو هو اختار محافظة غير القاهرة
 * والجيزة تكتبه ٤ أيام». So: those two cities at three working days, the whole
 * rest of the country at four.
 *
 * ## Keyed on the CODE, never on `governorates.region`
 *
 * The predecessor read `region === 'upper' || region === 'frontier' ? 4 : 3`,
 * and that rule cannot express this one. Egypt's official classification puts
 * الجيزة in `upper` and الإسكندرية in `urban` — so a region test quoted Giza
 * four days and Alexandria three, which is backwards for the two cities the
 * courier actually reaches soonest. It also quoted three days to the entire
 * Delta, which is the promise he is tightening.
 *
 * ## Promise the LONGER number when in doubt
 *
 * Three days quoted to somebody in أسوان is a complaint on day four; four days
 * quoted to القاهرة is a parcel that pleasantly arrives early. Every caller
 * that cannot resolve a governorate falls back to 4 for this reason.
 *
 * ## It is a function, not a column
 *
 * This is a promise about the COURIER, not a property of the governorate. It
 * changes when the shipping company does, and a column would have to be
 * back-filled across every historical order to say so.
 */
const NEXT_DAY_GOVERNORATES = new Set(['01', '21']);

export function deliveryDaysFor(governorateCode: string): number {
  return NEXT_DAY_GOVERNORATES.has(governorateCode) ? 3 : 4;
}
