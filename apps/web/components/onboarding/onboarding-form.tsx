'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { OnboardingSchema, type Onboarding } from '@ayman/contracts/onboarding';
import type { Taxonomy } from '@ayman/contracts/taxonomy';
import { copy } from '@ayman/contracts/copy';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody } from '@ayman/ui/components/card';
import { apiPatch, ApiRequestError } from '@/lib/api';
import { safeNext } from '@/lib/safe-next';
import { fixedSectionFor, offeredYearOptions } from '@/lib/section-defaults';
import { FormField } from '../auth/form-field';
import { SelectField, type SelectOption } from './select-field';
import { FixedSectionNote } from './fixed-section-note';
import { IdentityHeader } from './identity-header';
import { StepProgress } from './step-progress';

const GENDER_OPTIONS: SelectOption[] = [
  { value: 'male', label: copy.onboarding.genderMale },
  { value: 'female', label: copy.onboarding.genderFemale },
];

/**
 * The same two words the admin ticks on a course and a visitor reads on its
 * badge (`copy.stream`), so a student picking «لغات» here and a course
 * labelled «لغات» there are visibly the same thing. Two options and no
 * «الاتنين»: a course can serve both audiences, a student attends one school.
 */
const SCHOOL_STREAM_OPTIONS: SelectOption[] = [
  { value: 'general', label: copy.stream.general },
  { value: 'languages', label: copy.stream.languages },
];

/**
 * Which fields each step owns, so "can I move forward" can be answered by
 * validating exactly that step and nothing after it.
 *
 * Step 3 lists only `year` because the year is the only thing it asks. The
 * system, the track and the elective subject are filled from the taxonomy on
 * submit (`@/lib/section-defaults`) — this platform has one answer for each of
 * them — so there is nothing on that step for `trigger` to gate on.
 */
const STEPS = [
  { title: copy.onboarding.step1Title, fields: ['fullName', 'gender', 'phone'] },
  { title: copy.onboarding.step2Title, fields: ['governorateCode', 'schoolName', 'schoolStream'] },
  { title: copy.onboarding.step3Title, fields: ['year'] },
  { title: copy.onboarding.step4Title, fields: ['fatherPhone'] },
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

/**
 * `account` is who is filling this in — the name seeds the first field and the
 * avatar identifies the session, so nobody retypes what the provider already
 * told us.
 *
 * `next` is the last leg of the journey that started when the gate turned an
 * anonymous visitor away: login (or register) → here → back to whatever they
 * originally clicked. It arrives already validated by the page's `safeNext`.
 */
export function OnboardingForm({
  taxonomy,
  account,
  next,
}: {
  taxonomy: Taxonomy;
  account: {
    name: string;
    identity: string | null;
    image: string | null;
    /**
     * The number the account was registered with, in E.164, or null for a
     * Google sign-up that has not given one yet. Prefilled below rather than
     * asked for again.
     */
    phoneNumber: string | null;
  };
  next?: string | null;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const {
    register,
    handleSubmit,
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
    defaultValues: {
      fullName: account.name,
      /**
       * A student who registered by phone already gave us this number two
       * screens ago; making them retype it invites a typo that would either
       * fail the unique index or, worse, quietly move their sign-in identity
       * to a number they do not own.
       *
       * Left editable rather than locked, and prefilled as `undefined` (not
       * `''`) for a Google account so the field behaves like an untouched
       * required input rather than one the student already emptied.
       *
       * Editing it is honest: `completeOnboarding` writes both
       * `users.phone_number` and the profile mirror in one transaction, so the
       * number they leave here IS the number they will sign in with.
       */
      phone: account.phoneNumber ?? undefined,
    },
  });

  const pinnedGovernorates = taxonomy.pinnedGovernorateCodes
    .map((code) => taxonomy.governorates.find((g) => g.code === code))
    .filter((g): g is Taxonomy['governorates'][number] => g !== undefined);
  const restGovernorates = taxonomy.governorates.filter(
    (g) => !taxonomy.pinnedGovernorateCodes.includes(g.code),
  );
  const governorateOptions: SelectOption[] = [...pinnedGovernorates, ...restGovernorates].map(
    (g) => ({ value: g.code, label: g.nameAr }),
  );

  const yearOptions: SelectOption[] = offeredYearOptions(taxonomy);

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
      // The three answers the student was never asked for, resolved from the
      // taxonomy and written LAST so they win over whatever the form holds —
      // nothing on screen registers them, but a spread that lost to `values`
      // would be a silent no-op the moment one of them ever did.
      await apiPatch('/api/profile/onboarding', {
        ...values,
        ...fixedSectionFor(taxonomy, values.year),
      });
    } catch (error) {
      setFormError(
        error instanceof ApiRequestError && error.status === 409
          ? copy.onboarding.phoneConflictError
          : copy.onboarding.submitError,
      );
      return;
    }

    // Task 8's redirect matrix sends a fully-onboarded visitor to /onboarding
    // straight back to /dashboard — land there directly on first completion
    // too, rather than at '/' (the public marketing page) and relying on a
    // second bounce.
    //
    // `next` wins when there is one: the profile was the only thing standing
    // between this student and the course they clicked several screens ago, and
    // depositing them on the dashboard now would make them find it again.
    //
    // Full page navigation, same rule as `LoginForm`/`RegisterForm`:
    // `onboardingCompleted` just changed, and `proxy.ts`'s redirect matrix and
    // every authenticated layout branch on it. A soft navigation to a `next`
    // the visitor viewed while anonymous would serve them that cached payload.
    /**
     * Via `/welcome`, which offers the WhatsApp channel once and then gets out
     * of the way. `next` rides along rather than being followed here, so a
     * student who started on a course page still lands there — one screen
     * later, having been asked once about the channel.
     *
     * `/welcome` redirects straight through when no channel is configured, so
     * this adds nothing to the journey on an install that has not set one.
     */
    const onward = safeNext(next);
    window.location.assign(
      onward ? `/welcome?next=${encodeURIComponent(onward)}` : '/welcome',
    );
  }

  return (
    <form
      /*
       * `method="post"` — see `auth/login-form.tsx` for the whole reasoning.
       *
       * This form has the most to lose of any on the platform: the student's
       * real name, their gender, their governorate and their PHONE NUMBER. With
       * no method, a press before React hydrates is handled by the browser as a
       * GET — the page reloads as `/onboarding?fullName=…&phone=…` and all of
       * it is in the URL, the history, and every access log on the way.
       *
       * Found by `auth/form-method.test.ts`, which reads the source precisely
       * because the next form written is the one at risk: a hand-grep for
       * `<form onSubmit` missed this file, where the attribute is on its own
       * line.
       */
      method="post"
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
      <IdentityHeader name={account.name} identity={account.identity} image={account.image} />

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
            {/* Its own Arabic message rather than zod's, exactly as `gender`
                does two fields up: an enum that receives `''` produces
                "Invalid option" in English, and there is nothing useful to
                translate per-value. */}
            <SelectField
              label={copy.onboarding.schoolStream}
              placeholder={copy.onboarding.schoolStreamPlaceholder}
              options={SCHOOL_STREAM_OPTIONS}
              errorMessage={errors.schoolStream ? copy.onboarding.schoolStreamError : undefined}
              {...register('schoolStream')}
            />
          </div>

          {/* One question. The system, the track and the subject used to be
              three more selects here, each with exactly one right answer —
              see `@/lib/section-defaults`. They are stated as facts below
              instead, because a student who expected to pick a track needs to
              be told where it went; an empty step would read as a bug. */}
          <div hidden={stepIndex !== 2} className="space-y-5">
            <SelectField
              label={copy.onboarding.year}
              placeholder={copy.onboarding.yearPlaceholder}
              options={yearOptions}
              errorMessage={errors.year?.message}
              {...register('year', { setValueAs: emptyToUndefinedYear })}
            />
            <FixedSectionNote />
          </div>

          <div hidden={stepIndex !== 3} className="space-y-5">
            {/* Why the number is wanted, next to the field that wants it. A
                student handing over their father's phone should not have to
                leave the form to find out what it is for — and now that it is
                required rather than skippable, that explanation is the only
                thing standing between "asking" and "demanding". */}
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
              {copy.onboarding.parentPhonesWhy}
            </p>
            {/* No `setValueAs: emptyToUndefined` here, unlike every optional
                field on this form — and it is load-bearing. `egyptianPhone`
                carries its Arabic "مطلوب" message on `.min(1)`, which only
                fires for an EMPTY STRING; mapping the empty field to
                `undefined` would trip zod's type check instead and print an
                English "expected string, received undefined" at the student.
                The student's own phone on step 1 is registered the same way,
                for the same reason. */}
            <FormField
              label={copy.onboarding.fatherPhone}
              type="tel"
              placeholder={copy.onboarding.phonePlaceholder}
              errorMessage={errors.fatherPhone?.message}
              {...register('fatherPhone')}
            />
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
            a button that has become "حفظ ونكمّل" between press and release,
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

      {/*
        Under every step, not just the one asking for parents' numbers.
        The first step already asks for the student's own phone, so a
        disclosure that appears only at the end arrives three screens after
        the first thing it should have covered.

        `target="_blank"` so reading it does not discard a part-filled form —
        this form holds four steps of unsaved input and there is no draft.
      */}
      <p className="text-center text-[length:var(--fs-text-sm)] text-fg-muted">
        {copy.onboarding.privacyNote}{' '}
        <Link
          href="/privacy"
          target="_blank"
          rel="noopener"
          className="underline underline-offset-2"
        >
          {copy.onboarding.privacyLink}
        </Link>
      </p>
    </form>
  );
}
