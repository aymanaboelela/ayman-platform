'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { OnboardingSchema, type Onboarding, type Taxonomy, copy } from '@ayman/contracts';
import { Button, Card, CardBody, CardHeader, CardTitle } from '@ayman/ui';
import { apiPatch, ApiRequestError } from '@/lib/api';
import { recordParentPhonesSkipped } from '@/lib/onboarding-skip';
import { FormField } from '../auth/form-field';
import { SelectField, type SelectOption } from './select-field';

const GENDER_OPTIONS: SelectOption[] = [
  { value: 'male', label: copy.onboarding.genderMale },
  { value: 'female', label: copy.onboarding.genderFemale },
];

/**
 * Native `<select>`s always report an empty string for "nothing chosen" —
 * never `undefined` — but `OnboardingSchema` needs `undefined` for its
 * `.optional()` fields (an empty string fails their `.min(1)` checks, which
 * exist to reject a genuinely blank submission, not an unanswered optional
 * one). This is the client-side half of keeping the two states apart.
 */
function emptyToUndefined(value: string): string | undefined {
  return value === '' ? undefined : value;
}

function emptyToUndefinedYear(value: string): number | undefined {
  return value === '' ? undefined : Number(value);
}

export function OnboardingForm({ taxonomy }: { taxonomy: Taxonomy }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [parentPhonesSkipped, setParentPhonesSkipped] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<Onboarding>({ resolver: zodResolver(OnboardingSchema) });

  const systemValue = watch('system');
  const yearValue = watch('year');
  const trackIdValue = watch('trackId');
  const electiveSubjectIdValue = watch('electiveSubjectId');

  const selectedSystem = taxonomy.systems.find((system) => system.slug === systemValue);

  // §5.2, non-negotiable: track is HIDDEN ENTIRELY (not disabled) once year
  // is 1 — grade 1 is common and non-specialised across both systems — and
  // requires a system to even know which track list to offer.
  const showTrack = systemValue !== undefined && yearValue !== undefined && yearValue !== 1;
  const trackOptions = useMemo(
    () => (showTrack ? (selectedSystem?.tracks ?? []) : []),
    [showTrack, selectedSystem],
  );
  const selectedTrack = trackOptions.find((track) => track.id === trackIdValue);

  // Elective only exists for بكالوريا year 2, and its two options are scoped
  // to whichever track was chosen.
  const showElective =
    systemValue === 'bacalorya' && yearValue === 2 && trackIdValue !== undefined;
  const electiveOptions = useMemo(
    () => (showElective ? (selectedTrack?.electiveGroups[0]?.options ?? []) : []),
    [showElective, selectedTrack],
  );

  // Whenever the hidden/track-list conditions change (switching system,
  // dropping to year 1, or a stale id that no longer belongs to the current
  // list), clear the value rather than leave it lingering unseen — a hidden
  // field must never be able to reach the submit payload. Deliberately
  // `shouldValidate: false` (the default): this is a silent programmatic
  // reset, not a user submit attempt, so it must not conjure a fresh
  // "اختر المادة الاختيارية"-style error out of thin air for a step the
  // student hasn't even reached yet. `clearErrors` still drops any STALE
  // error already attached to the field being cleared, so a real error
  // never lingers next to a blanked-out value either.
  useEffect(() => {
    if (trackIdValue === undefined) return;
    const stillValid = showTrack && trackOptions.some((track) => track.id === trackIdValue);
    if (!stillValid) {
      setValue('trackId', undefined);
      clearErrors('trackId');
    }
  }, [showTrack, trackOptions, trackIdValue, setValue, clearErrors]);

  useEffect(() => {
    if (electiveSubjectIdValue === undefined) return;
    const stillValid =
      showElective && electiveOptions.some((option) => option.id === electiveSubjectIdValue);
    if (!stillValid) {
      setValue('electiveSubjectId', undefined);
      clearErrors('electiveSubjectId');
    }
  }, [showElective, electiveOptions, electiveSubjectIdValue, setValue, clearErrors]);

  const pinnedGovernorates = taxonomy.pinnedGovernorateCodes
    .map((code) => taxonomy.governorates.find((g) => g.code === code))
    .filter((g): g is Taxonomy['governorates'][number] => g !== undefined);
  const restGovernorates = taxonomy.governorates.filter(
    (g) => !taxonomy.pinnedGovernorateCodes.includes(g.code),
  );
  const governorateOptions: SelectOption[] = [...pinnedGovernorates, ...restGovernorates].map(
    (g) => ({ value: g.code, label: g.nameAr }),
  );

  const systemOptions: SelectOption[] = taxonomy.systems.map((system) => ({
    value: system.slug,
    label: system.nameAr,
  }));

  const yearSource = selectedSystem ?? taxonomy.systems[0];
  const yearOptions: SelectOption[] = (yearSource?.years ?? []).map((year) => ({
    value: String(year.year),
    label: year.labelAr,
  }));

  const trackSelectOptions: SelectOption[] = trackOptions.map((track) => ({
    value: track.id,
    label: track.labelAr,
  }));

  const electiveSelectOptions: SelectOption[] = electiveOptions.map((option) => ({
    value: option.id,
    label: option.nameAr,
  }));

  function toggleParentPhonesSkipped() {
    setParentPhonesSkipped((skipped) => {
      const next = !skipped;
      if (next) {
        setValue('fatherPhone', undefined);
        setValue('motherPhone', undefined);
        clearErrors(['fatherPhone', 'motherPhone']);
      }
      return next;
    });
  }

  async function onSubmit(values: Onboarding) {
    setFormError(null);
    try {
      await apiPatch('/api/profile/onboarding', values);
    } catch (error) {
      setFormError(
        error instanceof ApiRequestError && error.status === 409
          ? copy.onboarding.phoneConflictError
          : copy.onboarding.submitError,
      );
      return;
    }

    if (parentPhonesSkipped) {
      recordParentPhonesSkipped();
    }

    router.replace('/');
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{copy.onboarding.step1Title}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          <FormField
            label={copy.onboarding.fullName}
            placeholder={copy.onboarding.fullNamePlaceholder}
            autoComplete="name"
            errorMessage={errors.fullName?.message}
            {...register('fullName')}
          />
          <SelectField
            label={copy.onboarding.gender}
            placeholder={copy.onboarding.genderPlaceholder}
            options={GENDER_OPTIONS}
            errorMessage={errors.gender ? copy.onboarding.genderError : undefined}
            {...register('gender')}
          />
          <FormField
            label={copy.onboarding.phone}
            type="tel"
            autoComplete="tel"
            placeholder={copy.onboarding.phonePlaceholder}
            errorMessage={errors.phone?.message}
            {...register('phone')}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{copy.onboarding.step2Title}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          <SelectField
            label={copy.onboarding.governorate}
            placeholder={copy.onboarding.governoratePlaceholder}
            options={governorateOptions}
            errorMessage={errors.governorateCode?.message}
            {...register('governorateCode')}
          />
          <FormField
            label={copy.onboarding.schoolName}
            placeholder={copy.onboarding.schoolNamePlaceholder}
            errorMessage={errors.schoolName?.message}
            {...register('schoolName', { setValueAs: emptyToUndefined })}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{copy.onboarding.step3Title}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          <SelectField
            label={copy.onboarding.system}
            placeholder={copy.onboarding.systemPlaceholder}
            options={systemOptions}
            errorMessage={errors.system?.message}
            {...register('system', { setValueAs: emptyToUndefined })}
          />
          <SelectField
            label={copy.onboarding.year}
            placeholder={copy.onboarding.yearPlaceholder}
            options={yearOptions}
            errorMessage={errors.year?.message}
            {...register('year', { setValueAs: emptyToUndefinedYear })}
          />
          {showTrack && (
            <SelectField
              label={copy.onboarding.track}
              placeholder={copy.onboarding.trackPlaceholder}
              options={trackSelectOptions}
              errorMessage={errors.trackId?.message}
              {...register('trackId', { setValueAs: emptyToUndefined })}
            />
          )}
          {showElective && (
            <SelectField
              label={copy.onboarding.electiveSubject}
              placeholder={copy.onboarding.electiveSubjectPlaceholder}
              options={electiveSelectOptions}
              errorMessage={errors.electiveSubjectId?.message}
              {...register('electiveSubjectId', { setValueAs: emptyToUndefined })}
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>{copy.onboarding.optionalTitle}</CardTitle>
            <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
              {copy.onboarding.optionalSubtitle}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={toggleParentPhonesSkipped}>
            {parentPhonesSkipped ? copy.onboarding.undoSkip : copy.onboarding.skip}
          </Button>
        </CardHeader>
        {parentPhonesSkipped ? (
          <CardBody>
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
              {copy.onboarding.skipHint}
            </p>
          </CardBody>
        ) : (
          <CardBody className="space-y-5">
            <FormField
              label={copy.onboarding.fatherPhone}
              type="tel"
              placeholder={copy.onboarding.parentPhonePlaceholder}
              errorMessage={errors.fatherPhone?.message}
              {...register('fatherPhone', { setValueAs: emptyToUndefined })}
            />
            <FormField
              label={copy.onboarding.motherPhone}
              type="tel"
              placeholder={copy.onboarding.parentPhonePlaceholder}
              errorMessage={errors.motherPhone?.message}
              {...register('motherPhone', { setValueAs: emptyToUndefined })}
            />
          </CardBody>
        )}
      </Card>

      {formError && (
        <p role="alert" className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
          {formError}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? copy.onboarding.submitPending : copy.onboarding.submit}
      </Button>
    </form>
  );
}
