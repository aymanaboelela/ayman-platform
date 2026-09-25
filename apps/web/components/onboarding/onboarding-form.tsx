'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  GraduationCap,
  Landmark,
  Languages,
  MapPin,
  Phone,
  School,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { OnboardingSchema, type Onboarding } from '@ayman/contracts/onboarding';
import type { Taxonomy } from '@ayman/contracts/taxonomy';
import { copy } from '@ayman/contracts/copy';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody } from '@ayman/ui/components/card';
import { apiPatch, ApiRequestError } from '@/lib/api';
import { safeNext } from '@/lib/safe-next';
import { tenantSentence } from '@/lib/tenant-copy';
import { fixedSectionFor, offeredYearOptions } from '@/lib/section-defaults';
import { SCHOOL_STREAM_OPTIONS, governorateOptions as governorateOptionsFor } from '@/lib/profile-options';
import { cityOptions } from '@/lib/city-options';
import { StudyAttendanceFields } from '@/components/centers/attendance-fields';
import {
  attendancePayload,
  centerFieldErrors,
  slotRefusal,
  slotsForYear,
  type CenterFieldName,
} from '@/components/centers/center-form';
import { useCenters } from '@/components/centers/use-centers';
import { FormField } from '../auth/form-field';
import { PhoneField } from '../auth/phone-field';
import { SelectField, type SelectOption } from './select-field';
import { FieldNote } from './field-note';
import { GenderCards } from './gender-cards';
import { IdentityHeader } from './identity-header';
import { StepProgress } from './step-progress';
import {
  clearOnboardingDraft,
  readOnboardingDraft,
  useOnboardingDraft,
} from './use-onboarding-draft';

/** `useSyncExternalStore` with nothing to subscribe to — see `hydrated` below. */
const subscribeNothing = () => () => {};

/** Ties the guardian-phone `<FieldNote>` to the input it explains. */
const PARENT_PHONE_NOTE_ID = 'father-phone-why';

/**
 * Which fields each step owns, so "can I move forward" can be answered by
 * validating exactly that step and nothing after it.
 *
 * Step 3 asks the year, «نوع الدراسة» and — on a stack with a centre — «نوع
 * الحضور» and the slot. The system, the track and the elective subject are
 * filled from the taxonomy on submit (`@/lib/section-defaults`) — this
 * platform has one answer for each of them — so there is nothing on that step
 * for `trigger` to gate on for those.
 *
 * The three centre fields are listed so `trigger` re-checks their SHAPE, but
 * the schema has them optional; whether they are answered is
 * `centerFieldErrors`' call — see `components/centers/center-form.ts`.
 */
const STEPS = [
  { title: copy.onboarding.step1Title, fields: ['fullName', 'gender', 'phone'] },
  {
    title: copy.onboarding.step2Title,
    fields: ['governorateCode', 'cityId', 'schoolName', 'schoolStream'],
  },
  {
    title: copy.onboarding.step3Title,
    fields: ['year', 'studyType', 'attendanceMode', 'centerSlotId'],
  },
  { title: copy.onboarding.step4Title, fields: ['fatherPhone'] },
] as const satisfies ReadonlyArray<{
  title: string;
  fields: ReadonlyArray<keyof Onboarding>;
}>;

/** Which step owns `phone` — see `onSubmit`'s 409 branch, which sends the
 *  student back to it. Derived rather than written as `0`, so re-ordering the
 *  wizard cannot silently point the one server-side error at the wrong step. */
const PHONE_STEP = STEPS.findIndex((step) => (step.fields as readonly string[]).includes('phone'));

/** Which step owns the slot — where a «الميعاد ده اتملى» sends the wizard
 *  back to, derived for the same reason as `PHONE_STEP`. */
const CENTER_STEP = STEPS.findIndex((step) =>
  (step.fields as readonly string[]).includes('centerSlotId'),
);

/**
 * A native `<select>` reports an empty string for "nothing chosen", never
 * `undefined`, and `''` is not a number — so the year needs converting before
 * zod sees it.
 *
 * It maps to `undefined` rather than `NaN` deliberately: the field is REQUIRED
 * now, and `undefined` is what `z.number({ error: 'لازم نحدد الصف الدراسي' })` turns
 * into that Arabic message. `NaN` would fail the same check with zod's English
 * default instead.
 *
 * The string twin of this function is gone with `schoolName`'s optionality —
 * every remaining text field on the form is required, so none of them wants a
 * blank coerced away from the `.min(1)` message that explains it.
 */
function emptyToUndefinedNumber(value: string): number | undefined {
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
    watch,
    control,
    setError,
    setValue,
    clearErrors,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Onboarding>({
    resolver: zodResolver(OnboardingSchema),
    /**
     * The name the provider already gave us, rather than an empty field the
     * student has to retype. Editable like any other: Google's display name
     * is frequently a nickname or Latin transliteration, and this form's
     * `fullName` is what appears on their certificate.
     *
     * The draft is spread LAST, so a student returning from the privacy page
     * gets back what they typed rather than what the account said — including
     * a name they had already corrected. It is empty on a first visit, which
     * is why this reads as "the account's values, unless the student has
     * already been here". See `use-onboarding-draft.ts` for why it exists at
     * all: it is what let the privacy link stop opening a new tab.
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
      ...readOnboardingDraft(),
    },
  });

  useOnboardingDraft(watch);

  // Shared with the profile editor — see `@/lib/profile-options`, which is
  // also where the two option lists this form used to declare inline now live.
  const governorateOptions: SelectOption[] = governorateOptionsFor(taxonomy);

  const yearOptions: SelectOption[] = offeredYearOptions(taxonomy);

  /*
    «المدينة» takes its options from the governorate above it, so this one
    field re-renders the form when the governorate changes — nothing else
    does, which is why it subscribes to this key alone rather than to the
    whole form (see `useOnboardingDraft` on why that matters here).
    `useWatch`, not `watch(name)`: the React compiler cannot memoise around
    the latter and skips the whole component.
  */
  const governorateCode = useWatch({ control, name: 'governorateCode' });

  /*
    ⚠️ The city list is the one thing on this form RENDERED from a draft value.

    The draft is read from `sessionStorage`, which the server does not have:
    after a reload mid-wizard the server paints a disabled city select with
    only «بعد المحافظة» while the client's first render — which already has
    the draft's governorate — paints fifty options. That is a hydration
    mismatch, and React throws the whole boundary away to re-render it.

    `hydrated` is false on the server AND during hydration, true from the
    next render on, so the first client render matches the server's exactly
    and the options arrive one render later. Every other draft value reaches
    the DOM through react-hook-form's refs, not through render output, which
    is why nothing else needs this.
  */
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const cities = cityOptions(hydrated ? governorateCode : undefined);

  /*
    «نوع الحضور» is asked only when this stack has a centre. The list is read
    in the browser after mount, so the question never takes part in hydration;
    until it arrives — or if it never does — the stack is treated as online.
    The slots are narrowed to the year picked just above them, because the API
    cannot: this student has no stored year yet.
  */
  const { centers, reload: reloadCenters } = useCenters();
  const attendanceVisible = centers !== null && centers.length > 0;
  const slots = slotsForYear(centers ?? [], useWatch({ control, name: 'year' }));

  /** The step-3 answers the schema cannot demand — see `center-form.ts`. */
  function checkCenterFields(): boolean {
    const issues = centerFieldErrors(getValues(), { attendanceVisible, slots });
    for (const [field, message] of Object.entries(issues)) {
      setError(field as CenterFieldName, { type: 'required', message });
    }
    return Object.keys(issues).length === 0;
  }

  const isLastStep = stepIndex === STEPS.length - 1;

  /**
   * Validates only the current step's fields. Anything further on is not the
   * student's problem yet — running the whole schema here would light up
   * "المحافظة مطلوبة" under a step they have not reached.
   */
  async function goNext() {
    const valid = await trigger([...STEPS[stepIndex]!.fields]);
    // After `trigger`, which clears these fields' errors when their shape is
    // fine — the «is it answered» check has to land on top of that.
    const centersValid = stepIndex !== CENTER_STEP || checkCenterFields();
    if (!valid || !centersValid) return;
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
    // The centre list can change between step 3 and here (it is refetched on
    // a refusal), so the slot is re-checked where it is sent.
    if (!checkCenterFields()) {
      setStepIndex(CENTER_STEP);
      return;
    }
    try {
      // The three answers the student was never asked for, resolved from the
      // taxonomy and written LAST so they win over whatever the form holds —
      // nothing on screen registers them, but a spread that lost to `values`
      // would be a silent no-op the moment one of them ever did.
      //
      // The attendance pair goes after `values` for the same reason: with no
      // centre on screen it is «أونلاين», whatever a stale draft still holds.
      await apiPatch('/api/profile/onboarding', {
        ...values,
        ...fixedSectionFor(taxonomy, values.year),
        ...attendancePayload(values, { attendanceVisible, whenHidden: 'online' }),
      });
    } catch (error) {
      /*
       * A refused SLOT — somebody took the last seat while this student was
       * typing their guardian's number, or the admin closed it. Walk back to
       * the slot step with the reason under the list, and refetch it so the
       * card that was picked now says «فل». Checked before the phone branch
       * below because both can be a 409; only `payload.code` tells them apart.
       */
      const refusal = slotRefusal(error);
      if (refusal) {
        setValue('centerSlotId', null);
        setError('centerSlotId', { type: 'server', message: refusal }, { shouldFocus: false });
        setStepIndex(CENTER_STEP);
        setFormError(copy.centers.slotConflictHint);
        reloadCenters();
        return;
      }
      /*
       * ## The 409 is about the STUDENT'S OWN number, and it used to be shown
       *    under the guardian's.
       *
       * Nothing on this form can collide except `phone`: `users.phone_number`
       * and `student_profiles.phone` are the two UNIQUE columns behind that
       * 409, and both hold the student's own number. `father_phone` has no
       * unique index at all — two siblings are expected to give the same one.
       *
       * But the whole payload is submitted from step 4, whose only field is
       * «تليفون ولي الأمر», and the refusal was painted as a form-level line
       * directly under it. So the message every student read was «الرقم ده
       * متسجّل على حساب تاني» about the number they had just typed — their
       * father's — while the number actually taken sat three steps back with
       * nothing pointing at it. Reported as «كل ما اجي احط رقم ولي الامر يقول
       * متسجل قبل كده مع انه مش متسجل», which is exactly what it looks like.
       *
       * So the error is attached to the FIELD it belongs to and the wizard
       * walks back to it. `shouldFocus` is deliberately off: the step is being
       * switched in the same commit, and focusing an input inside a `hidden`
       * div does nothing on some browsers and scrolls the page on others.
       */
      if (error instanceof ApiRequestError && error.status === 409) {
        setError('phone', { message: copy.onboarding.phoneConflictError }, { shouldFocus: false });
        setStepIndex(PHONE_STEP);
        setFormError(copy.onboarding.phoneConflictHint);
        return;
      }
      setFormError(copy.onboarding.submitError);
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
    // The profile is written, so the draft has nothing left to protect — and
    // it is the most sensitive payload in the product. Cleared here rather
    // than left to expire with the tab, which on a school or shared computer
    // means "readable until somebody closes the browser".
    clearOnboardingDraft();

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
      // `onb-form` scopes the wizard's own look — the stepper, the cards, the
      // pill fields and the arrow buttons — in globals.css.
      className="onb-form space-y-6"
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
              variant="pill"
              icon={UserRound}
              label={copy.onboarding.fullName}
              placeholder={copy.onboarding.fullNamePlaceholder}
              autoComplete="name"
              hint={copy.onboarding.fullNameHint}
              errorMessage={errors.fullName?.message}
              {...register('fullName')}
            />
            {/* Two pictures instead of a two-word `<select>` — see
                `GenderCards`. Its own Arabic message for the same reason the
                select had one: an enum that receives nothing produces zod's
                English "Invalid option". */}
            <GenderCards
              registration={register('gender')}
              errorMessage={errors.gender ? copy.onboarding.genderError : undefined}
            />
            {/* `PhoneField`, not `FormField`: the number is rewritten to Latin
                digits as it is typed. The parser has always accepted ٠١٠ —
                this is so the student can SEE that it did. */}
            <PhoneField
              variant="pill"
              icon={Phone}
              label={copy.onboarding.phone}
              autoComplete="tel"
              placeholder={copy.onboarding.phonePlaceholder}
              errorMessage={errors.phone?.message}
              {...register('phone')}
            />
          </div>

          <div hidden={stepIndex !== 1} className="space-y-5">
            <SelectField
              variant="pill"
              icon={Landmark}
              label={copy.onboarding.governorate}
              placeholder={copy.onboarding.governoratePlaceholder}
              options={governorateOptions}
              errorMessage={errors.governorateCode?.message}
              {...register('governorateCode', {
                // A city belongs to ONE governorate: changing the governorate
                // empties the city rather than keeping an id `refineCity`
                // would reject on submit, several steps from here.
                onChange: () => setValue('cityId', undefined as unknown as number),
              })}
            />
            {/* Disabled until there is a governorate to list cities for, and
                the placeholder says so — an enabled select with nothing in
                it reads as broken. */}
            {/* Keyed on its option set, so a new list is a new `<select>`:
                react-hook-form writes the stored value into an element when it
                REGISTERS it, and a restored city id set on the empty
                pre-hydration select matched no option and was dropped from the
                DOM while the form still held it. */}
            <SelectField
              key={hydrated ? (governorateCode ?? 'none') : 'server'}
              variant="pill"
              icon={MapPin}
              label={copy.onboarding.city}
              placeholder={
                cities.length > 0 ? copy.onboarding.cityPlaceholder : copy.onboarding.cityNeedsGovernorate
              }
              options={cities}
              disabled={cities.length === 0}
              errorMessage={errors.cityId?.message}
              {...register('cityId', { setValueAs: emptyToUndefinedNumber })}
            />
            <FormField
              variant="pill"
              icon={School}
              label={copy.onboarding.schoolName}
              placeholder={copy.onboarding.schoolNamePlaceholder}
              errorMessage={errors.schoolName?.message}
              /* Deliberately no `setValueAs`: the field is required now, so a blank
                 input must arrive as `''` and earn «اسم المدرسة مطلوب» rather
                 than becoming `undefined` and failing the type check with zod's
                 English default. */
              {...register('schoolName')}
            />
            {/* Its own Arabic message rather than zod's, exactly as `gender`
                does two fields up: an enum that receives `''` produces
                "Invalid option" in English, and there is nothing useful to
                translate per-value. */}
            <SelectField
              variant="pill"
              icon={Languages}
              label={copy.onboarding.schoolStream}
              placeholder={copy.onboarding.schoolStreamPlaceholder}
              options={SCHOOL_STREAM_OPTIONS}
              errorMessage={errors.schoolStream ? copy.onboarding.schoolStreamError : undefined}
              {...register('schoolStream')}
            />
          </div>

          {/*
            The year, then «نوع الدراسة» and — on a stack with a centre — «نوع
            الحضور»: questions whose answers differ between students. What is
            NOT here is anything with one right answer.

            The system, the track and the subject used to be three more selects
            here, each with exactly one right answer (see
            `@/lib/section-defaults`), and when they went they were replaced by
            a panel STATING all three — on the reasoning that a student who
            expected to pick a track needs to be told where it went, and that
            an empty step would read as a bug.

            Neither half held up. The step is not empty: it asks «إنت في سنة
            كام» and offers the years. And the student it was written for does
            not exist — nobody arrives at a sign-up form looking for the
            education system they are about to be told they cannot choose. What
            the panel actually did was put «النظام الدراسي · البكالوريا
            المصرية / المسار · مسار الهندسة وعلوم الحاسب / المادة · البرمجة
            وعلوم الحاسب» in front of someone three steps into a form, and
            invite them to work out whether any of it needed an answer.

            `FixedSectionNote` itself is untouched and still rendered by
            `/settings/section`, where the same three facts ARE the answer to
            the question that page raises — "if I change my year, what else
            changes?".
          */}
          <div hidden={stepIndex !== 2} className="space-y-5">
            <SelectField
              variant="pill"
              icon={GraduationCap}
              label={copy.onboarding.year}
              placeholder={copy.onboarding.yearPlaceholder}
              options={yearOptions}
              errorMessage={errors.year?.message}
              {...register('year', { setValueAs: emptyToUndefinedNumber })}
            />
            {/* «نوع الدراسة» always; «نوع الحضور» and the slot only on a
                stack with a centre. Shared with «بياناتك». */}
            <StudyAttendanceFields
              control={control}
              register={register}
              clearErrors={clearErrors}
              errors={errors}
              attendanceVisible={attendanceVisible}
              slots={slots}
            />
          </div>

          <div hidden={stepIndex !== 3} className="space-y-5">
            {/* Why the number is wanted, next to the field that wants it, and
                ATTACHED to it: `aria-describedby` below, and a tinted panel
                with an icon rather than a grey paragraph. It was the latter,
                and was read as page furniture and skipped — see the copy's own
                docblock. Now that the number is required rather than skippable,
                this explanation is the only thing standing between "asking" and
                "demanding". */}
            <FieldNote id={PARENT_PHONE_NOTE_ID} icon={ShieldCheck}>
              {copy.onboarding.parentPhonesWhy}
            </FieldNote>
            {/* No `setValueAs: emptyToUndefined` here, unlike every optional
                field on this form — and it is load-bearing. `egyptianPhone`
                carries its Arabic "مطلوب" message on `.min(1)`, which only
                fires for an EMPTY STRING; mapping the empty field to
                `undefined` would trip zod's type check instead and print an
                English "expected string, received undefined" at the student.
                The student's own phone on step 1 is registered the same way,
                for the same reason. */}
            <PhoneField
              variant="pill"
              icon={Phone}
              label={copy.onboarding.fatherPhone}
              placeholder={copy.onboarding.phonePlaceholder}
              errorMessage={errors.fatherPhone?.message}
              aria-describedby={PARENT_PHONE_NOTE_ID}
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
          <Button type="button" variant="secondary" className="onb-btn" onClick={goBack}>
            {/* Each arrow points the way the button MOVES you in this RTL
                form: back is towards the start (→), forward towards the end
                (←) — and the disc sits on the side it points to. */}
            <span className="onb-btn__disc" aria-hidden="true">
              <ArrowRight className="size-4" />
            </span>
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
          <Button
            key="submit"
            type="submit"
            className="onb-btn onb-btn--primary flex-1"
            disabled={isSubmitting}
          >
            {isSubmitting ? copy.onboarding.submitPending : copy.onboarding.submit}
            <span className="onb-btn__disc" aria-hidden="true">
              <ArrowLeft className="size-4" />
            </span>
          </Button>
        ) : (
          <Button
            key="next"
            type="button"
            className="onb-btn onb-btn--primary flex-1"
            onClick={() => void goNext()}
          >
            {copy.onboarding.next}
            <span className="onb-btn__disc" aria-hidden="true">
              <ArrowLeft className="size-4" />
            </span>
          </Button>
        )}
      </div>

      {/*
        Under every step, not just the one asking for parents' numbers.
        The first step already asks for the student's own phone, so a
        disclosure that appears only at the end arrives three screens after
        the first thing it should have covered.

        ## Why this is an ordinary link again

        It carried `target="_blank"`, and the reason given was sound: the form
        holds four steps of unsaved input and opening the policy in place would
        have thrown all of it away. The cost of that trade only shows up on a
        phone. A new tab starts with no history, so the back gesture — the only
        "back" most of this audience uses — does nothing at all, and the legal
        page's own way out was a link at the very BOTTOM of a long document
        pointing at the marketing home page. Reported exactly like that: «دخلت
        على سياسة الخصوصية من تحت، أنا مش قادر إن أنا أرجع».

        `use-onboarding-draft.ts` removes the trade rather than picking a side
        of it. The answers survive the navigation, so this can be a plain link:
        back works because it is real history, and `?from=onboarding` gives the
        policy page a labelled way back for the students who look for a control
        instead of a gesture.
      */}
      <p className="text-center text-[length:var(--fs-text-sm)] text-fg-muted">
        {/*
          ⚠️ `tenantSentence()`, and of everything the tenant gate touches on
          the public pages this is the line that had to be fixed first.

          «بياناتك محفوظة عند أيمن أبو العلا وبس» is not a heading and not a
          brand mark — it is a PROMISE about where a phone number goes, made to
          a student who is usually a minor, at the moment they type it, on a
          form that asks for their father's number one step later. On a second
          instructor's deployment it named a man with no relationship to that
          data and no way to keep the promise, and the student reads it as the
          answer to «البيانات دي بتروح لمين؟» — so the one sentence on the form
          whose whole job is to be true was the one saying something false.

          It is also not covered by the rest of the screen being gated. This
          sentence exists BECAUSE the domain was flagged under «الصفحات
          المضلّلة» for collecting numbers while saying nothing about who
          receives them (see `copy.onboarding.privacyNote`), and a disclosure
          naming the wrong recipient is nearer to that finding than to the fix
          for it.

          The name sits in the MIDDLE of the sentence, so `tenantName()` has
          nothing to swap — `lib/tenant-copy.ts` carries the reasoning, and
          `tenant-copy.test.ts` asserts against THIS string that no spelling of
          the name survives on another stack while his own stack gets the
          identical string back on the function's first line.
        */}
        {tenantSentence(copy.onboarding.privacyNote)}{' '}
        <Link href="/privacy?from=onboarding" className="underline underline-offset-2">
          {copy.onboarding.privacyLink}
        </Link>
      </p>
    </form>
  );
}
