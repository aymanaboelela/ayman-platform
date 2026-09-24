'use client';

import { useState } from 'react';
import { citiesOf } from '@ayman/contracts/cities';
import { copy } from '@ayman/contracts/copy/admin';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';

/**
 * The governorate and, under it, its cities — the one pair on the student
 * form that cannot be two independent uncontrolled selects, because the second
 * one's options ARE the first one's value.
 *
 * Changing the governorate empties the city rather than keeping an id that
 * belongs to the previous one; the service would refuse that pairing anyway
 * (`students.service.ts` → `patch`), and a blank «المدينة» saves as `null`,
 * which is the honest state until somebody picks one.
 */
export function GovernorateCityFields({
  defaultGovernorateCode,
  defaultCityId,
  governorateOptions,
}: {
  defaultGovernorateCode: string;
  defaultCityId: number | null;
  governorateOptions: { value: string; label: string }[];
}) {
  const [governorateCode, setGovernorateCode] = useState(defaultGovernorateCode);
  const [cityId, setCityId] = useState(defaultCityId == null ? '' : String(defaultCityId));
  const cities = citiesOf(governorateCode);

  return (
    <>
      <div>
        <Label htmlFor="governorateCode">{copy.onboarding.governorate}</Label>
        <Select
          id="governorateCode"
          name="governorateCode"
          value={governorateCode}
          onChange={(event) => {
            setGovernorateCode(event.target.value);
            setCityId('');
          }}
        >
          {governorateOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="cityId">{copy.onboarding.city}</Label>
        <Select
          id="cityId"
          name="cityId"
          value={cityId}
          onChange={(event) => setCityId(event.target.value)}
        >
          <option value="">—</option>
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.nameAr}
            </option>
          ))}
        </Select>
      </div>
    </>
  );
}
