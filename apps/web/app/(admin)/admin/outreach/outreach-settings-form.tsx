'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  OutreachSettingsSchema,
  type OutreachSettings,
} from '@ayman/contracts/admin/settings';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Switch } from '@ayman/ui/components/switch';
import { cn } from '@ayman/ui/lib/cn';
import { SettingsField, issuesFromErrors } from '../settings/settings-field';
import { updateOutreachAction } from '../settings/actions';

const c = copy.admin.outreach;

/** `.default()` on every field makes the Zod INPUT type optional, so `useForm`
 *  needs the three-generic form to keep `onSubmit` typed against the OUTPUT —
 *  the identical note `branding-form.tsx` and `contact-form.tsx` carry. */
type FormValues = z.input<typeof OutreachSettingsSchema>;

type ToggleName = 'quizResult' | 'quizNudge' | 'lessonPraise' | 'whatsappInvite';
type NumberName =
  | 'nudgeAfterHours'
  | 'groupInviteEveryDays'
  | 'maxInvitesPerStudent'
  | 'maxPerStudentPerDay';

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
export function OutreachSettingsForm({ defaultValues }: { defaultValues: OutreachSettings }) {
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
