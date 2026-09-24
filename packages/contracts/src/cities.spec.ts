import { describe, expect, it } from 'vitest';
import { CITIES, cityBelongsTo, cityNameAr, citiesOf } from './cities';

/**
 * Our 27 codes, in `apps/api/src/scripts/seed-data/governorates.ts` order.
 * Written out rather than imported: contracts must not reach into the API
 * package, and a governorate added there without cities here is exactly the
 * drift this list exists to catch — a required «المدينة» with no options
 * would make onboarding impossible to finish on that governorate.
 */
const GOVERNORATE_CODES = [
  '01', '02', '03', '04', '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '31', '32', '33', '34', '35',
];

describe('CITIES', () => {
  it('covers exactly our governorates, each with at least one city', () => {
    expect(Object.keys(CITIES).sort()).toEqual([...GOVERNORATE_CODES].sort());
    for (const code of GOVERNORATE_CODES) expect(citiesOf(code).length).toBeGreaterThan(0);
  });

  it('never reuses an id — a stored city_id must mean one place', () => {
    const ids = Object.values(CITIES).flatMap((list) => list.map((city) => city.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate name inside a governorate, even spelled with another alef or yaa', () => {
    const fold = (name: string) => name.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
    for (const list of Object.values(CITIES)) {
      const names = list.map((city) => fold(city.nameAr));
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('is sorted the way an Arabic reader scans it', () => {
    const collator = new Intl.Collator('ar');
    for (const list of Object.values(CITIES)) {
      const names = list.map((city) => city.nameAr);
      expect(names).toEqual([...names].sort(collator.compare));
    }
  });

  it('keeps the two moves the source got wrong', () => {
    // Filed under القاهرة in the source; they are الشرقية and القليوبية.
    const cairo = citiesOf('01').map((city) => city.nameAr);
    expect(cairo).not.toContain('العاشر من رمضان');
    expect(cairo).not.toContain('مدينة العبور');
    expect(cairo).toContain('مدينة نصر');
  });
});

describe('cityBelongsTo / cityNameAr', () => {
  it('pairs a city with its own governorate only', () => {
    expect(cityBelongsTo('01', 1)).toBe(true);
    expect(cityBelongsTo('02', 1)).toBe(false);
    expect(cityBelongsTo('99', 1)).toBe(false);
  });

  it('names a stored id, and names nothing for a missing one', () => {
    expect(cityNameAr(1)).toBe('15 مايو');
    expect(cityNameAr(null)).toBeNull();
    expect(cityNameAr(999_999)).toBeNull();
  });
});
