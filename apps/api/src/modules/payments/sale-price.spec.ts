import { chargedPlanPriceCents, publicSale, publicTermSale } from './sale-price';

let featureOn = true;
jest.mock('../../common/entitlements', () => ({ isFeatureEnabled: () => featureOn }));

/**
 * «عرض»: while an offer is live every plan it covers costs its sale price, to
 * everyone; after its end date — or on a stack without the feature — the
 * regular one. The catalog publishes only a live offer.
 */
describe('course sale', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  const course = {
    monthlyPriceCents: 15000,
    yearlyPriceCents: 95000,
    saleMonthlyPriceCents: 9900,
    saleYearlyPriceCents: null,
    saleEndsAt: new Date('2026-11-10T00:00:00Z'),
  };
  const term = { priceCents: 45000, salePriceCents: 35000 };

  beforeEach(() => {
    featureOn = true;
  });

  it('charges the sale price on the plans that have one', () => {
    expect(chargedPlanPriceCents(course, 'monthly', null, 15000, now)).toBe(9900);
    expect(chargedPlanPriceCents(course, 'term', term, 45000, now)).toBe(35000);
    expect(chargedPlanPriceCents(course, 'yearly', null, 95000, now)).toBe(95000);
  });

  it('charges the regular price after the end date', () => {
    const after = new Date('2026-11-11T00:00:00Z');
    expect(chargedPlanPriceCents(course, 'monthly', null, 15000, after)).toBe(15000);
    expect(chargedPlanPriceCents(course, 'term', term, 45000, after)).toBe(45000);
  });

  it('never sells «٣ شهور» on offer, and keeps a plan not sold unsold', () => {
    expect(chargedPlanPriceCents(course, 'quarterly', null, 30000, now)).toBe(30000);
    expect(chargedPlanPriceCents(course, 'monthly', null, null, now)).toBeNull();
  });

  it('is off entirely on a stack without the feature', () => {
    featureOn = false;
    expect(chargedPlanPriceCents(course, 'monthly', null, 15000, now)).toBe(15000);
    expect(publicSale(course, now).saleMonthlyPriceCents).toBeNull();
    expect(publicTermSale(course, term, now)).toBeNull();
  });

  it('publishes a live offer with its end date, and nothing once it is over', () => {
    expect(publicSale(course, now)).toEqual({
      saleMonthlyPriceCents: 9900,
      saleYearlyPriceCents: null,
      saleEndsAt: '2026-11-10T00:00:00.000Z',
    });
    expect(publicSale(course, new Date('2026-11-11T00:00:00Z')).saleMonthlyPriceCents).toBeNull();
  });
});
