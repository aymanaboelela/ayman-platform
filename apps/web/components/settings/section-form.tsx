'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { StudentSectionSchema, type StudentSection } from '@ayman/contracts/onboarding';
import type { Taxonomy } from '@ayman/contracts/taxonomy';
import { copy } from '@ayman/contracts/copy';
import { Button } from '@ayman/ui/components/button';
import { apiPatch } from '@/lib/api';
import { fixedSectionFor, offeredYearOptions } from '@/lib/section-defaults';
import { FixedSectionNote } from '@/components/onboarding/fixed-section-note';
import { SelectField, type SelectOption } from '@/components/onboarding/select-field';

const c = copy.section;

/**
 * «غيّر صفّك» — the one field that decides which courses a student sees.
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
 * ## Why one select and not four
 *
 * It used to ask for the system, the year, the track and the elective subject,
 * with a cascade keeping them consistent. Three of those have exactly one
 * right answer on this platform, so they are filled from the taxonomy on
 * submit and stated on screen instead — see `@/lib/section-defaults` and
 * `FixedSectionNote`. That also retires this form's worst failure: بكالوريا
 * year 2 required an elective whose select only appeared once a track was
 * picked, so the blocking error landed on a field nobody could see and the
 * save button silently did nothing.
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
  currentYear,
}: {
  taxonomy: Taxonomy;
  currentYear: number | undefined;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StudentSection>({
    resolver: zodResolver(StudentSectionSchema),
    defaultValues: { year: currentYear },
  });

  const yearOptions: SelectOption[] = offeredYearOptions(taxonomy);

  async function onSubmit(values: StudentSection) {
    setFormError(null);
    try {
      // Only the year comes off the form; `fixedSectionFor` supplies the
      // system, the track and the elective that go with it. Sending the whole
      // resolved section rather than `{ year }` alone matters: this route
      // writes all four columns, so omitting them would blank a track the
      // student never asked to lose.
      await apiPatch('/api/profile/section', fixedSectionFor(taxonomy, values.year));
    } catch {
      setFormError(c.saveFailed);
      return;
    }
    // `refresh()` before `push()`: /library is a Server Component reading the
    // profile, and without it the student lands back on a cached render of the
    // section they just left.
    router.refresh();
    router.push('/library');
  }

  return (
    <form
      // `method="post"` — see `auth/login-form.tsx`. This one carries the
      // student's school and section, which do not belong in a URL either.
      method="post"
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5"
      noValidate
    >
      <SelectField
        label={copy.onboarding.year}
        placeholder={copy.onboarding.yearPlaceholder}
        options={yearOptions}
        errorMessage={errors.year?.message}
        {...register('year', { setValueAs: (v: string) => (v === '' ? undefined : Number(v)) })}
      />

      <FixedSectionNote />

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
