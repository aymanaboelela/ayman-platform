'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { OnboardingSchema, type Onboarding, type Taxonomy, copy } from '@ayman/contracts';
import { Button, Card, CardBody } from '@ayman/ui';
import { apiPatch, ApiRequestError } from '@/lib/api';
import { recordParentPhonesSkipped } from '@/lib/onboarding-skip';
import { FormField } from '../auth/form-field';
import { SelectField, type SelectOption } from './select-field';
import { IdentityHeader } from './identity-header';
import { StepProgress } from './step-progress';

const GENDER_OPTIONS: SelectOption[] = [
  { value: 'male', label: copy.onboarding.genderMale },
  { value: 'female', label: copy.onboarding.genderFemale },
];

/**
 * Which fields each step owns, so "can I move forward" can be answered by
 * validating exactly that step and nothing after it. Listing them here rather
 * than inferring from what is rendered keeps the check honest when a field is
 * conditionally hidden: `trackId` belongs to step 3 whether or not it is on
 * screen, and `trigger` on an unmounted-but-valid field passes.
 */
const STEPS = [
  { title: copy.onboarding.step1Title, fields: ['fullName', 'gender', 'phone'] },
  { title: copy.onboarding.step2Title, fields: ['governorateCode', 'schoolName'] },
  {
    title: copy.onboarding.step3Title,
    fields: ['system', 'year', 'trackId', 'electiveSubjectId'],
  },
  { title: copy.onboarding.optionalTitle, fields: ['fatherPhone', 'motherPhone'] },
] as const satisfies ReadonlyArray<{
  title: string;
  fields: ReadonlyArray<keyof Onboarding>;
}>;

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

export function OnboardingForm({
  taxonomy,
  account,
}: {
  taxonomy: Taxonomy;
  account: { name: string; email: string; image: string | null };
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [parentPhonesSkipped, setParentPhonesSkipped] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    clearErrors,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<Onboarding>({
    resolver: zodResolver(OnboardingSchema),
    /**
     * The name the provider already gave us, rather than an empty field the
     * student has to retype. Editable like any other: Google's display name
     * is frequently a nickname or Latin transliteration, and this form's
     * `fullName` is what appears on their certificate.
     */
    defaultValues: { fullName: account.name },
  });

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

  const isLastStep = stepIndex === STEPS.length - 1;

  /**
   * Validates only the current step's fields. Anything further on is not the
   * student's problem yet — running the whole schema here would light up
   * "المحافظة مطلوبة" under a step they have not reached.
   */
  async function goNext() {
    const valid = await trigger([...STEPS[stepIndex]!.fields]);
    if (!valid) return;
    setFormError(null);
    setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
  }

  /** Never validates: going back to fix an answer must not be blocked by the
   *  error you are going back to fix. */
  function goBack() {
    setFormError(null);
    setStepIndex((index) => Math.max(index - 1, 0));
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

    // Task 8's redirect matrix sends a fully-onboarded visitor to /onboarding
    // straight back to /dashboard — land there directly on first completion
    // too, rather than at '/' (the public marketing page) and relying on a
    // second bounce.
    router.replace('/dashboard');
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="space-y-6"
      /**
       * Enter must not submit from steps 1-3. A single-step form can treat
       * Enter as "submit"; a wizard cannot, or the first press on the first
       * text field fires a submit for a form whose later steps are empty and
       * paints errors for questions nobody has been shown.
       */
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !isLastStep && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          void goNext();
        }
      }}
    >
      <IdentityHeader name={account.name} email={account.email} image={account.image} />

      <StepProgress
        currentStep={stepIndex + 1}
        totalSteps={STEPS.length}
        title={STEPS[stepIndex]!.title}
      />

      <Card>
        {/* Every step keeps its fields MOUNTED and hides the inactive ones with
            `hidden`, rather than unmounting them. react-hook-form would retain
            the values either way, but an unmounted field cannot be focused —
            and `trigger` focuses the first invalid one. Unmounting would mean
            a validation error on a step you are not looking at silently
            focuses nothing. */}
        <CardBody className="space-y-5">
          <div hidden={stepIndex !== 0} className="space-y-5">
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
          </div>

          <div hidden={stepIndex !== 1} className="space-y-5">
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
          </div>

          <div hidden={stepIndex !== 2} className="space-y-5">
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
          </div>

          <div hidden={stepIndex !== 3} className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
                {copy.onboarding.optionalSubtitle}
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={toggleParentPhonesSkipped}>
                {parentPhonesSkipped ? copy.onboarding.undoSkip : copy.onboarding.skip}
              </Button>
            </div>
            {parentPhonesSkipped ? (
              <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
                {copy.onboarding.skipHint}
              </p>
            ) : (
              <div className="space-y-5">
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
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {formError && (
        <p role="alert" className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
          {formError}
        </p>
      )}

      <div className="flex gap-3">
        {stepIndex > 0 && (
          <Button type="button" variant="secondary" onClick={goBack}>
            {copy.onboarding.back}
          </Button>
        )}
        {/* The `key`s are load-bearing, not tidiness. These two render into the
            same slot, so without them React reconciles one into the other and
            KEEPS THE DOM NODE — only swapping the label and `type`. A click
            dispatched while the step change is still committing then lands on
            a button that has become "احفظ وكمّل" between press and release,
            submitting the form a step early. Distinct keys force a real
            unmount/remount, so that click hits a detached node and does
            nothing instead. */}
        {isLastStep ? (
          <Button key="submit" type="submit" className="flex-1" disabled={isSubmitting}>
            {isSubmitting ? copy.onboarding.submitPending : copy.onboarding.submit}
          </Button>
        ) : (
          <Button key="next" type="button" className="flex-1" onClick={() => void goNext()}>
            {copy.onboarding.next}
          </Button>
        )}
      </div>
    </form>
  );
}
