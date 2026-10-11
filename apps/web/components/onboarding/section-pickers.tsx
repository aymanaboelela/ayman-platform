'use client';

import { useSyncExternalStore } from 'react';
import { GraduationCap, Route, School } from 'lucide-react';
import {
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';
import type { Onboarding } from '@ayman/contracts/onboarding';
import type { Taxonomy } from '@ayman/contracts/taxonomy';
import { copy } from '@ayman/contracts/copy';
import { subjectCopy } from '@ayman/contracts/copy/subject';
import { systemOptions, trackOptionsFor, yearOptionsFor } from '@/lib/subject-section';
import { SelectField } from './select-field';

/** `useSyncExternalStore` with nothing to subscribe to — see `live` below. */
const subscribeNothing = () => () => {};

/** A native `<select>` reports `''` for "nothing chosen"; the schema wants `undefined`. */
const emptyToUndefined = (value: string): string | undefined => (value === '' ? undefined : value);
const emptyToUndefinedNumber = (value: string): number | undefined =>
  value === '' ? undefined : Number(value);

/**
 * النظام الدراسي → الصف → المسار — the three selects a stack that does not teach
 * code asks, in place of the wizard's single year select. See
 * `lib/subject-section.ts` for why they are asked there and nowhere else.
 *
 * Shared by the onboarding wizard and «بياناتك», the way `StudyAttendanceFields`
 * is, so the two cannot disagree about what a section is.
 *
 * ## The year waits for the system
 *
 * The two systems name every year differently, so the year select has nothing
 * true to offer until a system is chosen — it is disabled and says so, the
 * pattern the city select already uses under the governorate. The track select
 * appears only once there are tracks to choose from: year two onwards, in a
 * system that has them.
 *
 * ## `deferUntilHydrated`
 *
 * The wizard restores a DRAFT from `sessionStorage`, which the server does not
 * have, so on a reload mid-wizard the client's first render would know a system
 * the server's did not and paint a different set of year options — a hydration
 * mismatch that throws the whole boundary away. The wizard passes `true`, and
 * both option lists are computed from the server's answer (no system yet) until
 * hydration has finished; the selects are keyed on their option set so a new
 * list is a new `<select>` that react-hook-form writes the stored value into.
 * The same reasoning `cityOptions` carries in `onboarding-form.tsx`.
 * «بياناتك» is prefilled from props the server also had, so it passes `false`.
 */
export function SectionPickers({
  taxonomy,
  control,
  register,
  setValue,
  errors,
  variant = 'plain',
  deferUntilHydrated,
}: {
  taxonomy: Taxonomy;
  control: Control<Onboarding>;
  register: UseFormRegister<Onboarding>;
  setValue: UseFormSetValue<Onboarding>;
  errors: FieldErrors<Onboarding>;
  variant?: 'plain' | 'pill';
  deferUntilHydrated: boolean;
}) {
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const live = !deferUntilHydrated || hydrated;

  // `useWatch`, not `watch(name)` — the React compiler cannot memoise around
  // the latter and skips the whole component (same note as the wizard's).
  const system = useWatch({ control, name: 'system' });
  const year = useWatch({ control, name: 'year' });
  const shownSystem = live ? system : undefined;
  const shownYear = live ? year : undefined;

  const years = yearOptionsFor(taxonomy, shownSystem);
  const tracks = trackOptionsFor(taxonomy, shownSystem, shownYear);

  return (
    <>
      <SelectField
        variant={variant}
        icon={variant === 'pill' ? School : undefined}
        label={copy.onboarding.system}
        placeholder={copy.onboarding.systemPlaceholder}
        options={systemOptions(taxonomy)}
        errorMessage={errors.system?.message}
        {...register('system', {
          setValueAs: emptyToUndefined,
          // A track id belongs to ONE system, so a new system empties it rather
          // than keeping an id the API would refuse on submit.
          onChange: () => setValue('trackId', undefined),
        })}
      />
      <SelectField
        key={live ? `years-${shownSystem ?? 'none'}` : 'server'}
        variant={variant}
        icon={variant === 'pill' ? GraduationCap : undefined}
        label={copy.onboarding.year}
        placeholder={years.length > 0 ? copy.onboarding.yearPlaceholder : subjectCopy.onboarding.yearNeedsSystem}
        options={years}
        disabled={years.length === 0}
        errorMessage={errors.year?.message}
        {...register('year', { setValueAs: emptyToUndefinedNumber })}
      />
      {tracks.length > 0 ? (
        <SelectField
          key={`tracks-${shownSystem ?? 'none'}-${shownYear ?? 'none'}`}
          variant={variant}
          icon={variant === 'pill' ? Route : undefined}
          label={copy.onboarding.track}
          placeholder={copy.onboarding.trackPlaceholder}
          options={tracks}
          errorMessage={errors.trackId?.message}
          {...register('trackId', { setValueAs: emptyToUndefined })}
        />
      ) : null}
    </>
  );
}
