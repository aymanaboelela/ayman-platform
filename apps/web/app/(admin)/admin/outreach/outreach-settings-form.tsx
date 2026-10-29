'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  OutreachSettingsSchema,
  QUIZ_RESULT_RECIPIENTS,
  type OutreachSettings,
  type QuizResultRecipient,
} from '@ayman/contracts/admin/settings';
import { copy } from '@ayman/contracts/copy/admin';
import { adminAutoOutreach as auto } from '@ayman/contracts/copy/admin-auto-outreach';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { RadioGroup, RadioGroupItem } from '@ayman/ui/components/radio-group';
import { Switch } from '@ayman/ui/components/switch';
import { cn } from '@ayman/ui/lib/cn';
import { SettingsField, issuesFromErrors } from '../settings/settings-field';
import { updateOutreachAction } from '../settings/actions';

const c = copy.admin.outreach;

/** `.default()` on every field makes the Zod INPUT type optional, so `useForm`
 *  needs the three-generic form to keep `onSubmit` typed against the OUTPUT —
 *  the identical note `branding-form.tsx` and `contact-form.tsx` carry. */
type FormValues = z.input<typeof OutreachSettingsSchema>;

type ToggleName =
  | 'quizResult'
  | 'quizNudge'
  | 'lessonPraise'
  | 'whatsappInvite'
  | 'checkoutRecovery'
  | 'signupNudge';
type NumberName =
  | 'nudgeAfterHours'
  | 'groupInviteEveryDays'
  | 'maxInvitesPerStudent'
  | 'maxPerStudentPerDay'
  | 'checkoutRecoveryAfterHours'
  | 'checkoutRecoveryEveryDays'
  | 'signupNudgeAfterHours'
  | 'signupNudgeSecondAfterDays'
  | 'autoWhatsappDailyCap';

const TOGGLES: readonly { name: ToggleName; label: string; hint: string }[] = [
  { name: 'quizResult', label: c.quizResult, hint: c.quizResultHint },
  { name: 'quizNudge', label: c.quizNudge, hint: c.quizNudgeHint },
  { name: 'lessonPraise', label: c.lessonPraise, hint: c.lessonPraiseHint },
  { name: 'whatsappInvite', label: c.whatsappInvite, hint: c.whatsappInviteHint },
];

const NUMBERS: readonly { name: NumberName; label: string; hint: string }[] = [
  { name: 'nudgeAfterHours', label: c.nudgeAfterHours, hint: c.nudgeAfterHoursHint },
  { name: 'groupInviteEveryDays', label: c.groupInviteEveryDays, hint: c.groupInviteEveryDaysHint },
  { name: 'maxInvitesPerStudent', label: c.maxInvitesPerStudent, hint: c.maxInvitesPerStudentHint },
  { name: 'maxPerStudentPerDay', label: c.maxPerStudentPerDay, hint: c.maxPerStudentPerDayHint },
];

/**
 * «رسايل الواتساب التلقائية» — drawn only on a stack that holds the
 * `outreach.whatsapp` entitlement. The VALUES are in the same settings object
 * everywhere (they ride the one PATCH below either way, at their defaults);
 * what is withheld elsewhere is a switch for a sweeper that never runs there.
 */
const AUTO_TOGGLES: readonly { name: ToggleName; label: string; hint: string }[] = [
  { name: 'checkoutRecovery', label: auto.checkoutRecovery, hint: auto.checkoutRecoveryHint },
  { name: 'signupNudge', label: auto.signupNudge, hint: auto.signupNudgeHint },
];

/**
 * «نتيجة الامتحان تتبعت لمين». Inside the WhatsApp block, because the
 * guardian leg goes out from the linked device: on a stack without
 * `outreach.whatsapp` the API reads every value as `student`, and a choice
 * drawn there would be a control that does nothing.
 */
const RESULT_RECIPIENT_LABEL: Record<QuizResultRecipient, { name: string; hint: string }> = {
  student: { name: auto.quizResultToStudent, hint: auto.quizResultToStudentHint },
  guardian: { name: auto.quizResultToGuardian, hint: auto.quizResultToGuardianHint },
  both: { name: auto.quizResultToBoth, hint: auto.quizResultToBothHint },
};

const CHOICE_CARD =
  'flex items-start gap-3 rounded-[var(--r-md)] border border-line px-3 py-2.5 has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-accent/10';

const AUTO_NUMBERS: readonly { name: NumberName; label: string; hint: string }[] = [
  { name: 'checkoutRecoveryAfterHours', label: auto.checkoutRecoveryAfterHours, hint: auto.checkoutRecoveryAfterHoursHint },
  { name: 'checkoutRecoveryEveryDays', label: auto.checkoutRecoveryEveryDays, hint: auto.checkoutRecoveryEveryDaysHint },
  { name: 'signupNudgeAfterHours', label: auto.signupNudgeAfterHours, hint: auto.signupNudgeAfterHoursHint },
  { name: 'signupNudgeSecondAfterDays', label: auto.signupNudgeSecondAfterDays, hint: auto.signupNudgeSecondAfterDaysHint },
  { name: 'autoWhatsappDailyCap', label: auto.autoWhatsappDailyCap, hint: auto.autoWhatsappDailyCapHint },
];

/**
 * The four switches and the three numbers behind «رسايل م. أيمن».
 *
 * ## Why the rows are driven from a table
 *
 * Four toggles that differ only in their name and their two strings, written
 * out four times, is four places to forget one — and the failure mode is a
 * switch that renders but writes to the wrong key, which looks like a save
 * that did not work. The table is also what makes adding a fifth kind an edit
 * in one place.
 *
 * ## Why the whole thing is one save
 *
 * Unlike the settings page, which saves branding/SEO/contact separately: these
 * seven values describe ONE behaviour, and a half-applied change to it —
 * `whatsappInvite` on but `groupInviteEveryDays` still at yesterday's number —
 * is a state he did not ask for. One form, one PATCH, one section.
 */
export function OutreachSettingsForm({
  defaultValues,
  autoWhatsapp = false,
}: {
  defaultValues: OutreachSettings;
  autoWhatsapp?: boolean;
}) {
  const router = useRouter();
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = useForm<FormValues, unknown, OutreachSettings>({
    resolver: zodResolver(OutreachSettingsSchema),
    defaultValues,
  });
  const issues = issuesFromErrors(form.formState.errors);

  async function onSubmit(values: OutreachSettings) {
    setSaveError(null);
    const result = await updateOutreachAction(values);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
      router.refresh();
    } else {
      setSaveError(copy.admin.common.saveFailed);
      toast.error(copy.admin.common.saveFailed);
    }
  }

  return (
    <form
      // `method="post"` — see `auth/login-form.tsx`: without it a press before
      // hydration serialises the whole form into the URL.
      method="post"
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-5"
    >
      {saveError ? (
        <p role="alert" className="text-[length:var(--fs-text-sm)] text-err">
          {saveError}
        </p>
      ) : null}

      <ul className="flex flex-col divide-y divide-line-subtle">
        {TOGGLES.map((toggle) => (
          <li key={toggle.name} className="flex items-start justify-between gap-4 py-3.5 first:pt-0">
            <span className="min-w-0">
              <label
                htmlFor={`outreach-${toggle.name}`}
                className="block text-[length:var(--fs-text-sm)] font-medium text-fg"
              >
                {toggle.label}
              </label>
              <span className="mt-0.5 block text-[length:var(--fs-text-xs)] text-fg-muted">
                {toggle.hint}
              </span>
            </span>
            <Switch
              id={`outreach-${toggle.name}`}
              checked={form.watch(toggle.name) ?? true}
              onCheckedChange={(checked) =>
                form.setValue(toggle.name, checked, { shouldDirty: true })
              }
            />
          </li>
        ))}
      </ul>

      <div className="grid gap-5 sm:grid-cols-2">
        {NUMBERS.map((field) => (
          <SettingsField
            key={field.name}
            name={field.name}
            label={field.label}
            description={field.hint}
            issues={issues}
            render={(controlProps) => (
              <Input
                {...controlProps}
                type="number"
                inputMode="numeric"
                dir="ltr"
                value={String(form.watch(field.name) ?? '')}
                onChange={(event) => {
                  /*
                   * `Number.parseInt`, and NaN is passed through rather than
                   * swallowed. An empty box must fail the schema and show its
                   * message, not silently save as 0 — «كل 0 يوم يعزم على
                   * الجروب» is a message every student gets every hour.
                   */
                  const parsed = Number.parseInt(event.target.value, 10);
                  form.setValue(field.name, Number.isNaN(parsed) ? ('' as never) : parsed, {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                }}
              />
            )}
          />
        ))}
      </div>

      {autoWhatsapp ? (
        <fieldset className="flex flex-col gap-5 rounded-xl border border-accent/30 bg-accent/6 p-4">
          <legend className="px-1 text-[length:var(--fs-text-sm)] font-semibold text-accent-text">
            {auto.settingsHeading}
          </legend>

          <div role="group" aria-labelledby="outreach-quizResultTo-label" className="flex flex-col gap-2">
            <span
              id="outreach-quizResultTo-label"
              className="block text-[length:var(--fs-text-sm)] font-medium text-fg"
            >
              {auto.quizResultTo}
            </span>
            <span className="block text-[length:var(--fs-text-xs)] text-fg-muted">
              {auto.quizResultToHint}
            </span>
            <RadioGroup
              aria-labelledby="outreach-quizResultTo-label"
              value={form.watch('quizResultTo') ?? 'student'}
              onValueChange={(value) =>
                form.setValue('quizResultTo', value as QuizResultRecipient, { shouldDirty: true })
              }
              className="grid gap-2 sm:grid-cols-3"
            >
              {QUIZ_RESULT_RECIPIENTS.map((value) => (
                <label key={value} className={CHOICE_CARD}>
                  <RadioGroupItem value={value} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-[length:var(--fs-text-sm)] text-fg">
                      {RESULT_RECIPIENT_LABEL[value].name}
                    </span>
                    <span className="mt-0.5 block text-[length:var(--fs-text-xs)] text-fg-muted">
                      {RESULT_RECIPIENT_LABEL[value].hint}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>
          <ul className="flex flex-col divide-y divide-line-subtle">
            {AUTO_TOGGLES.map((toggle) => (
              <li key={toggle.name} className="flex items-start justify-between gap-4 py-3.5 first:pt-0">
                <span className="min-w-0">
                  <label
                    htmlFor={`outreach-${toggle.name}`}
                    className="block text-[length:var(--fs-text-sm)] font-medium text-fg"
                  >
                    {toggle.label}
                  </label>
                  <span className="mt-0.5 block text-[length:var(--fs-text-xs)] text-fg-muted">
                    {toggle.hint}
                  </span>
                </span>
                <Switch
                  id={`outreach-${toggle.name}`}
                  checked={form.watch(toggle.name) ?? true}
                  onCheckedChange={(checked) =>
                    form.setValue(toggle.name, checked, { shouldDirty: true })
                  }
                />
              </li>
            ))}
          </ul>

          <div className="grid gap-5 sm:grid-cols-2">
            {AUTO_NUMBERS.map((field) => (
              <SettingsField
                key={field.name}
                name={field.name}
                label={field.label}
                description={field.hint}
                issues={issues}
                render={(controlProps) => (
                  <Input
                    {...controlProps}
                    type="number"
                    inputMode="numeric"
                    dir="ltr"
                    value={String(form.watch(field.name) ?? '')}
                    onChange={(event) => {
                      /*
                       * `Number.parseInt`, and NaN is passed through rather than
                       * swallowed. An empty box must fail the schema and show its
                       * message, not silently save as 0 — «كل 0 يوم يعزم على
                       * الجروب» is a message every student gets every hour.
                       */
                      const parsed = Number.parseInt(event.target.value, 10);
                      form.setValue(field.name, Number.isNaN(parsed) ? ('' as never) : parsed, {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                    }}
                  />
                )}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      <p className={cn('text-[length:var(--fs-text-xs)] leading-[1.7] text-fg-muted')}>
        {c.settingsNote}
      </p>

      <div>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? copy.admin.common.saving : copy.admin.common.save}
        </Button>
      </div>
    </form>
  );
}
