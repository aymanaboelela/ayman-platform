'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { StudentSectionSchema, type StudentSection, type Taxonomy, copy } from '@ayman/contracts';
import { Button } from '@ayman/ui';
import { apiPatch, ApiRequestError } from '@/lib/api';
import { SelectField, type SelectOption } from '@/components/onboarding/select-field';

const c = copy.section;

/**
 * «غيّر صفّك ومسارك» — the four fields that decide which courses a student sees.
 *
 * ## Why this is not the onboarding wizard reopened
 *
 * `proxy.ts` sends a student who has finished onboarding straight from
 * /onboarding back to /dashboard, so the wizard is genuinely unreachable
 * afterwards — and reopening it would be wrong anyway: it prefills nothing but
 * the name, so "change my year" would mean retyping a phone number and a
 * governorate to get there. This form submits `PATCH /api/profile/section`,
 * which writes four columns and cannot touch anything else.
 *
 * ## The cascade
 *
 * Identical rules to the wizard's step 3, because they are literally the same
 * refinement (`StudentSectionSchema` and `OnboardingSchema` share it). Track is
 * HIDDEN — not disabled — at year 1, elective exists only for بكالوريا year 2,
 * and a value whose field has just been hidden is cleared rather than left to
 * ride along invisibly into the payload.
 *
 * ## Nothing here resets progress
 *
 * Deliberately. Progress lives on the enrollment and courses carry their own
 * year and track, so a new section shows a course list with no history against
 * it and switching back shows every number intact. The note under the submit
 * button says so, because a student about to change their year has every
 * reason to fear they are about to lose their work.
 */
export function SectionForm({
  taxonomy,
  current,
}: {
  taxonomy: Taxonomy;
  current: StudentSection;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<StudentSection>({
    resolver: zodResolver(StudentSectionSchema),
    defaultValues: current,
  });

  const systemValue = watch('system');
  const yearValue = watch('year');
  const trackIdValue = watch('trackId');
  const electiveSubjectIdValue = watch('electiveSubjectId');

  const selectedSystem = taxonomy.systems.find((system) => system.slug === systemValue);

  const showTrack = systemValue !== undefined && yearValue !== undefined && yearValue !== 1;
  const trackOptions = useMemo(
    () => (showTrack ? (selectedSystem?.tracks ?? []) : []),
    [showTrack, selectedSystem],
  );
  const selectedTrack = trackOptions.find((track) => track.id === trackIdValue);

  const showElective = systemValue === 'bacalorya' && yearValue === 2 && trackIdValue !== undefined;
  const electiveOptions = useMemo(
    () => (showElective ? (selectedTrack?.electiveGroups[0]?.options ?? []) : []),
    [showElective, selectedTrack],
  );

  // A hidden field must never reach the payload — see the wizard's own note.
  useEffect(() => {
    if (trackIdValue === undefined) return;
    if (!(showTrack && trackOptions.some((track) => track.id === trackIdValue))) {
      setValue('trackId', undefined);
      clearErrors('trackId');
    }
  }, [showTrack, trackOptions, trackIdValue, setValue, clearErrors]);

  useEffect(() => {
    if (electiveSubjectIdValue === undefined) return;
    if (!(showElective && electiveOptions.some((o) => o.id === electiveSubjectIdValue))) {
      setValue('electiveSubjectId', undefined);
      clearErrors('electiveSubjectId');
    }
  }, [showElective, electiveOptions, electiveSubjectIdValue, setValue, clearErrors]);

  const systemOptions: SelectOption[] = taxonomy.systems.map((system) => ({
    value: system.slug,
    label: system.nameAr,
  }));
  const yearOptions: SelectOption[] = (selectedSystem?.years ?? []).map((year) => ({
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

  /**
   * Validation can fail on a field that is not on screen, and without this the
   * form silently refuses to submit.
   *
   * The case is real, not theoretical: بكالوريا year 2 REQUIRES an elective,
   * but the elective select only appears once a track is chosen — so a student
   * who picks year 2 and stops gets a blocking error attached to
   * `electiveSubjectId`, a field they cannot see, and a save button that does
   * nothing when clicked. Naming the field they CAN act on is the fix.
   */
  function onInvalid(fieldErrors: Record<string, { message?: string } | undefined>) {
    if (fieldErrors.electiveSubjectId && trackIdValue === undefined) {
      setFormError(c.pickTrackFirst);
      return;
    }
    // Otherwise surface the first message in the order the fields are read,
    // so the alert and the field-level error agree about what is wrong.
    const first = (['system', 'year', 'trackId', 'electiveSubjectId'] as const)
      .map((key) => fieldErrors[key]?.message)
      .find((message): message is string => Boolean(message));
    setFormError(first ?? c.saveFailed);
  }

  async function onSubmit(values: StudentSection) {
    setFormError(null);
    try {
      await apiPatch('/api/profile/section', values);
    } catch (error) {
      setFormError(error instanceof ApiRequestError ? c.saveFailed : c.saveFailed);
      return;
    }
    // `refresh()` before `push()`: /library is a Server Component reading the
    // profile, and without it the student lands back on a cached render of the
    // section they just left.
    router.refresh();
    router.push('/library');
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-5" noValidate>
      <SelectField
        label={copy.onboarding.system}
        placeholder={copy.onboarding.systemPlaceholder}
        options={systemOptions}
        errorMessage={errors.system?.message}
        {...register('system', { setValueAs: (v: string) => (v === '' ? undefined : v) })}
      />
      <SelectField
        label={copy.onboarding.year}
        placeholder={copy.onboarding.yearPlaceholder}
        options={yearOptions}
        errorMessage={errors.year?.message}
        {...register('year', { setValueAs: (v: string) => (v === '' ? undefined : Number(v)) })}
      />
      {showTrack && (
        <SelectField
          label={copy.onboarding.track}
          placeholder={copy.onboarding.trackPlaceholder}
          options={trackSelectOptions}
          errorMessage={errors.trackId?.message}
          {...register('trackId', { setValueAs: (v: string) => (v === '' ? undefined : v) })}
        />
      )}
      {showElective && (
        <SelectField
          label={copy.onboarding.electiveSubject}
          placeholder={copy.onboarding.electiveSubjectPlaceholder}
          options={electiveSelectOptions}
          errorMessage={errors.electiveSubjectId?.message}
          {...register('electiveSubjectId', {
            setValueAs: (v: string) => (v === '' ? undefined : v),
          })}
        />
      )}

      <p className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-[length:var(--fs-text-sm)] text-fg-muted">
        {c.keepsProgress}
      </p>

      {formError ? (
        <p role="alert" className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
          {formError}
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? c.saving : c.save}
      </Button>
    </form>
  );
}
