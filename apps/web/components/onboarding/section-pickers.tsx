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
import {
  gradeOptions,
  gradeValueOf,
  systemOptions,
  trackOptionsFor,
  yearOptionsFor,
} from '@/lib/subject-section';
import { ASKS_GRADE, TENANT_GRADES } from '@/lib/tenant-grades';
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
  const trackId = useWatch({ control, name: 'trackId' });
  const shownSystem = live ? system : undefined;
  const shownYear = live ? year : undefined;

  const years = yearOptionsFor(taxonomy, shownSystem);
  const tracks = trackOptionsFor(taxonomy, shownSystem, shownYear);

  const trackSelect =
    tracks.length > 0 ? (
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
    ) : null;

  /*
   * A stack with `TENANT_GRADES` asks ONE question — «الصف الدراسي», with the
   * stack's own grades («الصف الأول الإعدادي» … «الصف الأول الثانوي») — and
   * writes the system and the year it stands for. The select itself is not a
   * form field: `system` and `year` stay the two fields the schema, the
   * draft and the API already know, so nothing past this component learns
   * that a grade exists. The track select still follows, for a grade whose
   * system has tracks that year (none of الإعدادية's do).
   */
  if (ASKS_GRADE) {
    const options = gradeOptions(taxonomy, TENANT_GRADES);
    return (
      <>
        <SelectField
          key={live ? 'grades' : 'server'}
          variant={variant}
          icon={variant === 'pill' ? GraduationCap : undefined}
          label={copy.onboarding.year}
          placeholder={copy.onboarding.yearPlaceholder}
          options={options}
          errorMessage={errors.year?.message ?? errors.system?.message}
          name="grade"
          value={gradeValueOf(TENANT_GRADES, shownSystem, shownYear)}
          onChange={(event) => {
            const grade = TENANT_GRADES.find((g) => g.slug === event.target.value);
            const touched = { shouldDirty: true, shouldValidate: true } as const;
            setValue('system', grade?.system, touched);
            setValue('year', grade?.year as number, touched);
            const stillValid = trackOptionsFor(taxonomy, grade?.system, grade?.year).some(
              (option) => option.value === trackId,
            );
            if (!stillValid) setValue('trackId', undefined);
          }}
        />
        {trackSelect}
      </>
    );
  }

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
        {...register('year', {
          setValueAs: emptyToUndefinedNumber,
          /*
           * ⚠️ A track the new year cannot have is emptied HERE, not left for
           * the submit to drop. Going from year 2 back to year 1 unmounts the
           * track select, but react-hook-form keeps its value — and the
           * step's own `trigger` then runs `refineSection`, which answers
           * «الصف الأول لا يختار مسارًا بعد» on a field that is no longer on
           * screen, and the wizard will not move. A track still valid for the
           * new year (2 → 3, same system) is kept.
           */
          onChange: (event: { target: { value: string } }) => {
            const next = emptyToUndefinedNumber(event.target.value);
            const stillValid = trackOptionsFor(taxonomy, system, next).some(
              (option) => option.value === trackId,
            );
            if (!stillValid) setValue('trackId', undefined);
          },
        })}
      />
      {trackSelect}
    </>
  );
}
