'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  GradeMethodSchema,
  NavMethodSchema,
  OverdueHandlingSchema,
  QuizModeSchema,
  QuizSettingsSchema,
  copy,
  type QuizSettings,
} from '@ayman/contracts';
import { Button, Checkbox, Input, Label, Select } from '@ayman/ui';
import { apiPut } from '@/lib/api';
import { ReviewMatrixField } from './review-matrix-field';

type QuizSettingsFormValues = z.input<typeof QuizSettingsSchema>;

export interface QuizSettingsFormProps {
  lessonId: string;
  defaultValues: QuizSettings;
}

/** `datetime-local`'s value format has no timezone — this app stores UTC, so
 *  round-trip through the LOCAL wall clock explicitly rather than trusting a
 *  naive string slice, which silently drifts by the browser's own offset. */
function toLocalInputValue(date: Date | null): string {
  if (!date) return '';
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromLocalInputValue(value: string): Date | null {
  return value ? new Date(value) : null;
}

export function QuizSettingsForm({ lessonId, defaultValues }: QuizSettingsFormProps) {
  const router = useRouter();
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = useForm<QuizSettingsFormValues, unknown, QuizSettings>({
    resolver: zodResolver(QuizSettingsSchema),
    defaultValues,
  });

  async function onSubmit(values: QuizSettings) {
    setSaveError(null);
    try {
      await apiPut(`/api/admin/quizzes/lesson/${lessonId}`, values);
      toast.success(copy.admin.common.saved);
      router.refresh();
    } catch {
      setSaveError(copy.admin.common.saveFailed);
      toast.error(copy.admin.common.saveFailed);
    }
  }

  const durationMinutes = form.watch('durationSeconds');
  const hasAnyError = Object.keys(form.formState.errors).length > 0;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-[var(--w-prose)] flex-col gap-5">
      {hasAnyError || saveError ? (
        <p role="alert" className="rounded-sm border border-err bg-surface-2 p-3 text-[length:var(--fs-text-sm)] text-err">
          {saveError ?? copy.admin.common.saveFailed}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="mode">{copy.quizAdmin.mode}</Label>
          <Select id="mode" {...form.register('mode')}>
            {QuizModeSchema.options.map((value) => (
              <option key={value} value={value}>
                {copy.quiz.modes[value]}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="durationMinutes">{copy.quizAdmin.durationMinutes}</Label>
          <Input
            id="durationMinutes"
            type="number"
            min={0}
            value={durationMinutes ? Math.round(durationMinutes / 60) : ''}
            onChange={(event) => {
              const minutes = Number(event.target.value);
              form.setValue('durationSeconds', minutes > 0 ? minutes * 60 : null, { shouldValidate: true });
            }}
          />
        </div>

        <div>
          <Label htmlFor="maxAttempts">{copy.quizAdmin.maxAttempts}</Label>
          <Input id="maxAttempts" type="number" min={0} {...form.register('maxAttempts', { valueAsNumber: true })} />
        </div>

        <div>
          <Label htmlFor="retryCooldownHours">{copy.quizAdmin.retryCooldownHours}</Label>
          <Input
            id="retryCooldownHours"
            type="number"
            min={0}
            {...form.register('retryCooldownHours', { valueAsNumber: true })}
          />
        </div>

        <div>
          <Label htmlFor="passPercent">{copy.quizAdmin.passPercent}</Label>
          <Input id="passPercent" type="number" min={0} max={100} {...form.register('passPercent', { valueAsNumber: true })} />
        </div>

        <div>
          <Label htmlFor="gradeOutOf">{copy.quiz.totalMarks}</Label>
          <Input id="gradeOutOf" type="number" min={1} {...form.register('gradeOutOf', { valueAsNumber: true })} />
        </div>

        <div>
          <Label htmlFor="gradeMethod">{copy.quizAdmin.gradeMethod}</Label>
          <Select id="gradeMethod" {...form.register('gradeMethod')}>
            {GradeMethodSchema.options.map((value) => (
              <option key={value} value={value}>
                {copy.quizAdmin.gradeMethodOptions[value]}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="navMethod">{copy.quizAdmin.navMethod}</Label>
          <Select id="navMethod" {...form.register('navMethod')}>
            {NavMethodSchema.options.map((value) => (
              <option key={value} value={value}>
                {value === 'free' ? copy.quizAdmin.navFree : copy.quizAdmin.navSequential}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="overdueHandling">{copy.quizAdmin.overdueHandling}</Label>
          <Select id="overdueHandling" {...form.register('overdueHandling')}>
            {OverdueHandlingSchema.options.map((value) => (
              <option key={value} value={value}>
                {value === 'autosubmit'
                  ? copy.quizAdmin.overdueAutosubmit
                  : value === 'graceperiod'
                    ? copy.quizAdmin.overdueGrace
                    : copy.quizAdmin.overdueAbandon}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="graceSeconds">{copy.quizAdmin.graceSeconds}</Label>
          <Input id="graceSeconds" type="number" min={0} {...form.register('graceSeconds', { valueAsNumber: true })} />
        </div>

        <div>
          <Label htmlFor="openFrom">{copy.quizAdmin.openFromLabel}</Label>
          <Input
            id="openFrom"
            type="datetime-local"
            // `z.coerce.date()`'s INPUT type is `unknown`, not `Date` — the
            // form genuinely stores a real Date here (see `defaultValues`
            // and `fromLocalInputValue` below), this cast just restates that.
            value={toLocalInputValue((form.watch('openFrom') as Date | null | undefined) ?? null)}
            onChange={(event) => form.setValue('openFrom', fromLocalInputValue(event.target.value), { shouldValidate: true })}
          />
        </div>

        <div>
          <Label htmlFor="openUntil">{copy.quizAdmin.openUntilLabel}</Label>
          <Input
            id="openUntil"
            type="datetime-local"
            value={toLocalInputValue((form.watch('openUntil') as Date | null | undefined) ?? null)}
            onChange={(event) => form.setValue('openUntil', fromLocalInputValue(event.target.value), { shouldValidate: true })}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={form.watch('shuffleQuestions')}
            onCheckedChange={(checked) => form.setValue('shuffleQuestions', checked === true)}
          />
          {copy.quizAdmin.shuffleQuestions}
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={form.watch('shuffleOptions')}
            onCheckedChange={(checked) => form.setValue('shuffleOptions', checked === true)}
          />
          {copy.quizAdmin.shuffleOptions}
        </label>
      </div>

      <ReviewMatrixField
        value={form.watch('reviewOptions')}
        onChange={(next) => form.setValue('reviewOptions', next, { shouldValidate: true })}
      />

      <div>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {copy.admin.common.save}
        </Button>
      </div>
    </form>
  );
}
