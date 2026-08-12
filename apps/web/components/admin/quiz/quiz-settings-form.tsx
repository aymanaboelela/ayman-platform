'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  NavMethodSchema,
  OverdueHandlingSchema,
  QuizSettingsSchema,
  type QuizSettings,
} from '@ayman/contracts/quiz/quiz-settings';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Switch } from '@ayman/ui/components/switch';
import { apiPut } from '@/lib/api';
import { ReviewMatrixField } from './review-matrix-field';

type QuizSettingsFormValues = z.input<typeof QuizSettingsSchema>;

export interface QuizSettingsFormProps {
  lessonId: string;
  defaultValues: QuizSettings;
  /**
   * Whether this lesson is its course's designated final exam.
   *
   * The improvement toggle is rendered ONLY here. Every other quiz is one
   * sitting, and offering a "second chance" control on a lecture quiz would
   * both contradict that rule and be refused by the API (`assertPaperAllowed`)
   * the moment anyone tried to build the paper.
   */
  isCourseExam: boolean;
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

export function QuizSettingsForm({ lessonId, defaultValues, isCourseExam }: QuizSettingsFormProps) {
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

      {/*
        Stated, not configurable. The allowance is `attemptAllowance()` in the
        contracts package and nothing in this form can widen it — saying so
        here is cheaper than letting an instructor hunt for the setting that
        used to be `maxAttempts`.
      */}
      <p className="rounded-sm border border-line-subtle bg-surface-2 p-3 text-[length:var(--fs-text-sm)] text-fg-muted">
        {copy.quizAdmin.singleAttemptNote}
      </p>

      {isCourseExam ? (
        <div className="flex items-start justify-between gap-4 rounded-sm border border-line-subtle bg-surface-2 p-3">
          <div className="min-w-0">
            <Label htmlFor="allowsImprovement">{copy.quizAdmin.allowsImprovement}</Label>
            <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
              {copy.quizAdmin.allowsImprovementHint}
            </p>
          </div>
          <Switch
            id="allowsImprovement"
            checked={form.watch('allowsImprovement') ?? false}
            onCheckedChange={(checked) =>
              form.setValue('allowsImprovement', checked, { shouldValidate: true })
            }
          />
        </div>
      ) : (
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
          {copy.quizAdmin.improvementExamOnly}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
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
          <Label htmlFor="passPercent">{copy.quizAdmin.passPercent}</Label>
          <Input id="passPercent" type="number" min={0} max={100} {...form.register('passPercent', { valueAsNumber: true })} />
        </div>

        <div>
          <Label htmlFor="gradeOutOf">{copy.quizAdmin.gradeOutOf}</Label>
          <Input id="gradeOutOf" type="number" min={1} {...form.register('gradeOutOf', { valueAsNumber: true })} />
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
