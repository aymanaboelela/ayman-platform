'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { OnboardingSchema, type Onboarding } from '@ayman/contracts/onboarding';
import type { AttendanceMode, CenterView, StudyType } from '@ayman/contracts/centers';
import type { Taxonomy } from '@ayman/contracts/taxonomy';
import { copy } from '@ayman/contracts/copy';
import { Button } from '@ayman/ui/components/button';
import { apiPatch, ApiRequestError } from '@/lib/api';
import { fixedSectionFor, offeredYearOptions } from '@/lib/section-defaults';
import { GENDER_OPTIONS, SCHOOL_STREAM_OPTIONS, governorateOptions } from '@/lib/profile-options';
import { cityOptions } from '@/lib/city-options';
import { FixedSectionNote } from '@/components/onboarding/fixed-section-note';
import { SelectField, type SelectOption } from '@/components/onboarding/select-field';
import { FormField } from '@/components/auth/form-field';
import { PhoneField } from '@/components/auth/phone-field';
import { StudyAttendanceFields } from '@/components/centers/attendance-fields';
import {
  attendancePayload,
  centerFieldErrors,
  slotRefusal,
  slotsForYear,
  type CenterFieldName,
} from '@/components/centers/center-form';
import { useCenters } from '@/components/centers/use-centers';

const c = copy.section;

/** What the page already knows about this student, to fill the form with. */
export interface ProfileDefaults {
  fullName?: string;
  gender?: 'male' | 'female' | null;
  phone?: string;
  governorateCode?: string;
  cityId?: number | null;
  schoolName?: string | null;
  schoolStream?: 'general' | 'languages' | null;
  year?: number | null;
  fatherPhone?: string | null;
  studyType?: StudyType | null;
  attendanceMode?: AttendanceMode | null;
  /** The slot of the live centre booking, from `/api/me/center-booking`. */
  centerSlotId?: string | null;
}

/**
 * «بياناتك» — everything a student told us about themselves, editable.
 *
 * ## What this replaces, and why it had to grow
 *
 * This was `SectionForm`: one select, the year. Every other answer the wizard
 * collected — the name, the governorate, the school, عام/لغات, the guardian's
 * number — was write-once. `proxy.ts` sends a fully-onboarded student from
 * /onboarding straight back to the dashboard, so the wizard is genuinely
 * unreachable afterwards, and `/profile` printed those fields read-only. A
 * student who mistyped their school, or who moved from a عام school to a لغات
 * one, had no route to fix it at all; the only fix was to ask an admin to edit
 * the row.
 *
 * That last one is not cosmetic. `schoolStream` is matched against a course's
 * `forGeneral`/`forLanguages`, so a wrong answer here shows the wrong catalog.
 *
 * ## Why `PATCH /profile/onboarding` and not a new endpoint
 *
 * It already writes exactly this set of columns, already resolves the section,
 * already keeps `users.phone_number` and `student_profiles.phone` in one
 * transaction, and already answers 409 when a number belongs to somebody else.
 * A second endpoint restating those rules is a second place for them to
 * disagree. `PATCH /profile/section` stays where it is — it is the narrower
 * write, and nothing here made it wrong.
 *
 * ⚠️ It is an UPSERT of the whole set, so every field has to be sent on every
 * save, prefilled or not. That is why this form renders all of them rather
 * than the one being changed: an absent `schoolName` here would blank a school
 * the student never touched.
 *
 * ## The phone is shown and not editable
 *
 * It is the login identity and it is UNIQUE. Rewriting it here with nothing
 * verifying the NEW number means a typo locks a student out of the account
 * they were editing, with no way back in to correct it. `c.phoneLocked` says
 * so next to the field, because a greyed-out box with no explanation reads as
 * a bug. It is still REGISTERED and still submitted — the endpoint writes all
 * of these columns at once, and omitting it would fail validation.
 *
 * ## Nothing here resets progress
 *
 * Progress lives on the enrollment and courses carry their own year and track,
 * so a new section shows a course list with no history against it and
 * switching back shows every number intact. `c.keepsProgress` says so under
 * the button, because a student about to change their year has every reason to
 * fear they are about to lose their work.
 */
export function ProfileForm({
  taxonomy,
  defaults,
  initialCenters,
}: {
  taxonomy: Taxonomy;
  defaults: ProfileDefaults;
  /** `/api/centers` as the server read it; `null` if that read failed. */
  initialCenters: CenterView[] | null;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    clearErrors,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Onboarding>({
    resolver: zodResolver(OnboardingSchema),
    /*
      `?? undefined` on every nullable column, not `?? ''`. react-hook-form
      seeds the DOM from these, and an empty string in a `<select>` selects the
      blank leading option — which is what "not answered yet" should look like.
      A null year and a null stream are both real states here: every profile
      onboarded before those questions existed has them.
    */
    defaultValues: {
      fullName: defaults.fullName,
      gender: defaults.gender ?? undefined,
      phone: defaults.phone,
      governorateCode: defaults.governorateCode,
      // Null for every profile that predates «المدينة» — the blank option,
      // and `OnboardingSchema` requires it, so the first save asks for it.
      cityId: defaults.cityId ?? undefined,
      schoolName: defaults.schoolName ?? undefined,
      schoolStream: defaults.schoolStream ?? undefined,
      year: defaults.year ?? undefined,
      fatherPhone: defaults.fatherPhone ?? undefined,
      // Null for every profile saved before these were asked — the cards
      // start unselected and the first save asks, as «المدينة» did.
      studyType: defaults.studyType ?? undefined,
      attendanceMode: defaults.attendanceMode ?? undefined,
      centerSlotId: defaults.centerSlotId ?? undefined,
    },
  });

  const yearOptions: SelectOption[] = offeredYearOptions(taxonomy);
  // `useWatch`, not `watch()` — see the same line in `OnboardingForm`.
  const cities = cityOptions(useWatch({ control, name: 'governorateCode' }));

  const { centers, reload: reloadCenters } = useCenters(initialCenters);
  const attendanceVisible = centers !== null && centers.length > 0;
  const slots = slotsForYear(centers ?? [], useWatch({ control, name: 'year' }));
  /*
    With the question hidden, «keep» unless the student is plainly online: a
    list that failed to load, or a centre that was closed under a booked
    student, must not quietly give their seat away because they saved a new
    school name. The API keeps what is stored when both keys are absent.
  */
  const whenHidden =
    centers === null || defaults.attendanceMode === 'center' ? 'keep' : 'online';

  /** The answers the schema cannot demand — see `center-form.ts`. */
  function checkCenterFields(): boolean {
    const issues = centerFieldErrors(getValues(), {
      attendanceVisible,
      slots,
      currentSlotId: defaults.centerSlotId,
    });
    for (const [field, message] of Object.entries(issues)) {
      setError(field as CenterFieldName, { type: 'required', message });
    }
    return Object.keys(issues).length === 0;
  }

  async function onSubmit(values: Onboarding) {
    setFormError(null);
    if (!checkCenterFields()) return;
    try {
      // `fixedSectionFor` LAST, so the three answers nobody is asked for — the
      // system, the track, the elective — win over whatever the form holds.
      // Same order and same reason as the wizard's submit. The attendance
      // pair likewise, so a hidden question sends what `whenHidden` says.
      await apiPatch('/api/profile/onboarding', {
        ...values,
        ...fixedSectionFor(taxonomy, values.year),
        ...attendancePayload(values, { attendanceVisible, whenHidden }),
      });
    } catch (error) {
      // A refused slot shares the 409 with the phone; `payload.code` decides.
      const refusal = slotRefusal(error);
      if (refusal) {
        setValue('centerSlotId', null);
        setError('centerSlotId', { type: 'server', message: refusal });
        setFormError(refusal);
        reloadCenters();
        return;
      }
      setFormError(
        error instanceof ApiRequestError && error.status === 409
          ? copy.onboarding.phoneConflictError
          : c.saveFailed,
      );
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
      // student's name, school and section, which do not belong in a URL.
      method="post"
      // The invalid branch runs the centre check too, so a missing «نوع
      // الدراسة» shows up in the same press as a missing school name rather
      // than on the next one.
      onSubmit={handleSubmit(onSubmit, () => void checkCenterFields())}
      className="space-y-8"
      noValidate
    >
      <Group title={c.groupPersonal}>
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
        {/* `readOnly`, deliberately NOT `disabled`: a disabled input is not
            submitted and — more to the point here — react-hook-form would
            still hold the value while the student sees a field the browser
            treats as inert. `readOnly` keeps it focusable, selectable and
            copyable, which is what someone reading their own number off the
            screen actually wants. */}
        <PhoneField
          label={copy.onboarding.phone}
          autoComplete="tel"
          placeholder={copy.onboarding.phonePlaceholder}
          readOnly
          aria-describedby="phone-locked"
          errorMessage={errors.phone?.message}
          {...register('phone')}
        />
        <p id="phone-locked" className="text-[length:var(--fs-text-sm)] text-fg-muted">
          {c.phoneLocked}
        </p>
        {/* No `setValueAs: emptyToUndefined`, same as the wizard: `egyptianPhone`
            carries its Arabic «مطلوب» on `.min(1)`, which only fires for an
            empty STRING. Mapping the blank field to `undefined` would trip
            zod's type check instead and print an English message. */}
        <PhoneField
          label={copy.onboarding.fatherPhone}
          placeholder={copy.onboarding.phonePlaceholder}
          errorMessage={errors.fatherPhone?.message}
          {...register('fatherPhone')}
        />
      </Group>

      <Group title={c.groupSchool}>
        <SelectField
          label={copy.onboarding.governorate}
          placeholder={copy.onboarding.governoratePlaceholder}
          options={governorateOptions(taxonomy)}
          errorMessage={errors.governorateCode?.message}
          {...register('governorateCode', {
            // The same rule as the wizard: a city belongs to one governorate.
            onChange: () => setValue('cityId', undefined as unknown as number),
          })}
        />
        <SelectField
          label={copy.onboarding.city}
          placeholder={
            cities.length > 0 ? copy.onboarding.cityPlaceholder : copy.onboarding.cityNeedsGovernorate
          }
          options={cities}
          disabled={cities.length === 0}
          errorMessage={errors.cityId?.message}
          {...register('cityId', {
            setValueAs: (value: string) => (value === '' ? undefined : Number(value)),
          })}
        />
        <FormField
          label={copy.onboarding.schoolName}
          placeholder={copy.onboarding.schoolNamePlaceholder}
          errorMessage={errors.schoolName?.message}
          {...register('schoolName')}
        />
        {/* Its own Arabic message rather than zod's, exactly as `gender` does:
            an enum that receives `''` produces "Invalid option" in English, and
            there is nothing useful to translate per-value. */}
        <SelectField
          label={copy.onboarding.schoolStream}
          placeholder={copy.onboarding.schoolStreamPlaceholder}
          options={SCHOOL_STREAM_OPTIONS}
          errorMessage={errors.schoolStream ? copy.onboarding.schoolStreamError : undefined}
          {...register('schoolStream')}
        />
      </Group>

      <Group title={c.groupSection}>
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
      </Group>

      <Group title={copy.centers.groupTitle}>
        <StudyAttendanceFields
          control={control}
          register={register}
          clearErrors={clearErrors}
          errors={errors}
          attendanceVisible={attendanceVisible}
          slots={slots}
          currentSlotId={defaults.centerSlotId}
        />
      </Group>

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

/**
 * One titled block of fields.
 *
 * Nine inputs in an undivided column is a form nobody reads to the bottom of;
 * three short groups with a heading each is the same nine questions with a
 * shape. `<h2>` rather than a styled `<p>`, so the headings are real landmarks
 * — this page is long enough on a phone that skipping by heading is how it
 * gets navigated.
 */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5">
      <h2 className="text-[length:var(--fs-title-3)] font-medium text-fg">{title}</h2>
      {children}
    </section>
  );
}
