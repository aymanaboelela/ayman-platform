import { deliveryDaysFor } from './delivery-days';

/**
 * A pure unit test with no database: the rule is two literals and a fallback,
 * and the thing worth pinning is which governorates land on which side of it.
 *
 * This exists because the predecessor keyed off `governorates.region` and got
 * exactly these cases wrong — see `delivery-days.ts`.
 */
describe('deliveryDaysFor', () => {
  it('promises three working days to القاهرة and الجيزة', () => {
    expect(deliveryDaysFor('01')).toBe(3); // القاهرة
    expect(deliveryDaysFor('21')).toBe(3); // الجيزة
  });

  it('promises four to everywhere else — including the two the region split got backwards', () => {
    // الإسكندرية is `region: urban`, so the old rule quoted it THREE days
    // alongside Cairo. It is not one of the two cities, so it is four now.
    expect(deliveryDaysFor('02')).toBe(4);
    // الدقهلية — the whole Delta is `lower` and used to get three.
    expect(deliveryDaysFor('12')).toBe(4);
    // أسوان — `upper`, four before and four now.
    expect(deliveryDaysFor('24')).toBe(4);
  });

  it('falls back to the LONGER promise for a code it does not know', () => {
    // Four days quoted to Cairo is a parcel that arrives early; three quoted to
    // أسوان is a complaint on day four. An unknown code must never shorten it.
    expect(deliveryDaysFor('')).toBe(4);
    expect(deliveryDaysFor('99')).toBe(4);
  });
});
