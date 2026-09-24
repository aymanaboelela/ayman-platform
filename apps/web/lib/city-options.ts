import { citiesOf } from '@ayman/contracts/cities';
import type { SelectOption } from '@/components/onboarding/select-field';

/**
 * A governorate's cities as `<select>` options, shared by the onboarding
 * wizard and the profile editor so the two cannot list them differently.
 *
 * Its own module rather than an export added to `profile-options.ts`:
 * Turbopack's module ids are path-derived, and a new export on a module the
 * previous build already shipped reads `undefined` in every tab that survived
 * the deploy.
 */
export function cityOptions(governorateCode: string | null | undefined): SelectOption[] {
  return citiesOf(governorateCode).map((city) => ({ value: String(city.id), label: city.nameAr }));
}
