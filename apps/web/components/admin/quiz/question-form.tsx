'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState, type KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  QUESTION_TYPES,
  QuestionInputSchema,
  copy,
  hasChoiceOptions,
  type QuestionInput,
  type QuestionType,
} from '@ayman/contracts';
import { Button, Input, Label, Select, Textarea } from '@ayman/ui';
import { apiPatch, apiPost } from '@/lib/api';
import { OptionRows, type OptionRowValue } from './option-rows';

/** The only part of the write response this form needs back. */
const SavedQuestionSchema = z.object({ bankEntryId: z.string() });

/**
 * `QuestionInputSchema`'s members carry `.default()`/`.prefault()` on
 * `defaultMark`/`settings` — so its INPUT type (what a still-typing user's
 * form state looks like, those fields optional) differs from its OUTPUT type
 * (`QuestionInput`, defaults already applied). `zodResolver` is generic over
 * both (`Resolver<Input, Context, Output>`), and `useForm`'s third generic is
 * exactly for this split — the field values RHF stores are the INPUT shape,
 * the value hitting `onSubmit` is the OUTPUT shape.
 */
type QuestionFormValues = z.input<typeof QuestionInputSchema>;

export interface QuestionFormProps {
  categories: { id: string; name: string }[];
  /** When present, PATCH this bank entry instead of POST-ing a new one. */
  bankEntryId?: string;
  defaultValues?: QuestionInput;
  onSaved?: (result: { bankEntryId: string }) => void;
}

const DEFAULT_MCQ: QuestionInput = {
  type: 'mcq_single',
  categoryId: '',
  stemHtml: '',
  defaultMark: 1,
  settings: { shuffleOptions: true, caseSensitive: false },
  options: [
    { bodyHtml: '', fraction: 1 },
    { bodyHtml: '', fraction: 0 },
  ],
} as QuestionInput;

/** Every option carries a stable client `id` — see `option-rows.tsx`'s own doc comment. */
function withClientIds(options: readonly { id?: string }[]): OptionRowValue[] {
  return options.map((option) => ({
    ...(option as OptionRowValue),
    id: option.id ?? crypto.randomUUID(),
  }));
}

/**
 * ONE resolver over the SAME discriminated union the API validates with —
 * see the contract's own comment on why every refinement lives inside its
 * union member rather than on the union itself (a union-level `.refine()`
 * reports at `path: []`, which no field can display, so the form would
 * silently refuse to submit with no visible error at all).
 */
export function QuestionForm({ categories, bankEntryId, defaultValues, onSaved }: QuestionFormProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [options, setOptionsState] = useState<OptionRowValue[]>(() =>
    withClientIds((defaultValues ?? DEFAULT_MCQ).options as readonly { id?: string }[]),
  );

  const form = useForm<QuestionFormValues, unknown, QuestionInput>({
    resolver: zodResolver(QuestionInputSchema),
    defaultValues: defaultValues ?? {
      ...DEFAULT_MCQ,
      categoryId: categories[0]?.id ?? '',
    },
    mode: 'onBlur',
  });

  const type = form.watch('type');

  function setOptions(next: OptionRowValue[]) {
    setOptionsState(next);
    form.setValue(
      'options',
      next.map(({ id: _id, ...rest }) => rest) as QuestionFormValues['options'],
      { shouldValidate: true, shouldDirty: true },
    );
  }

  // Switching type rewrites the option array to that type's legal shape —
  // leaving four MCQ options behind on a true/false question is how a form
  // ends up permanently unsubmittable with no visible error.
  function changeType(next: QuestionType) {
    form.setValue('type', next, { shouldValidate: false });
    if (next === 'true_false') {
      setOptions([
        { id: crypto.randomUUID(), bodyHtml: copy.quiz.true, fraction: 1 },
        { id: crypto.randomUUID(), bodyHtml: copy.quiz.false, fraction: 0 },
      ]);
    } else if (next === 'short_answer') {
      setOptions([{ id: crypto.randomUUID(), answerPattern: '', fraction: 1 }]);
    } else if (next === 'essay') {
      setOptions([]);
    } else if (!hasChoiceOptions(type)) {
      setOptions([
        { id: crypto.randomUUID(), bodyHtml: '', fraction: 1 },
        { id: crypto.randomUUID(), bodyHtml: '', fraction: 0 },
      ]);
    }
    form.clearErrors();
  }

  async function onSubmit(values: QuestionInput) {
    setSubmitError(null);
    try {
      const result = bankEntryId
        ? SavedQuestionSchema.parse(await apiPatch(`/api/admin/questions/${bankEntryId}`, values))
        : await apiPost('/api/admin/questions', SavedQuestionSchema, values);
      toast.success(copy.admin.common.saved);
      if (onSaved) onSaved(result);
      else router.push(`/admin/questions/${result.bankEntryId}`);
    } catch {
      setSubmitError(copy.admin.common.saveFailed);
      toast.error(copy.admin.common.saveFailed);
    }
  }

  // Enter in the last option field adds a new option; Ctrl/Cmd+Enter saves;
  // Escape closes. Listed in the footer so the UI teaches its own shortcuts.
  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void form.handleSubmit(onSubmit)();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      router.push('/admin/questions');
    }
  }

  const optionsIssue = form.formState.errors.options?.message as string | undefined;
  const hasAnyError = Object.keys(form.formState.errors).length > 0;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} onKeyDown={onKeyDown} className="max-w-[var(--w-prose)] space-y-5">
      {hasAnyError ? (
        <p role="alert" className="rounded-sm border border-err bg-surface-2 p-3 text-[length:var(--fs-text-sm)] text-err">
          {copy.admin.common.saveFailed}
        </p>
      ) : null}
      {submitError ? (
        <p role="alert" className="text-[length:var(--fs-text-sm)] text-err">
          {submitError}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="type" required>
            {copy.quizAdmin.type}
          </Label>
          <Select
            id="type"
            value={type}
            onChange={(event) => changeType(event.target.value as QuestionType)}
          >
            {QUESTION_TYPES.map((value) => (
              <option key={value} value={value}>
                {copy.quizAdmin.types[value]}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="categoryId" required>
            {copy.quizAdmin.category}
          </Label>
          <Select id="categoryId" {...form.register('categoryId')}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="stemHtml" required>
          {copy.quizAdmin.stem}
        </Label>
        <Textarea id="stemHtml" {...form.register('stemHtml')} aria-label={copy.quizAdmin.stem} />
        {form.formState.errors.stemHtml ? (
          <p role="alert" className="mt-1 text-[length:var(--fs-text-xs)] text-err">
            {form.formState.errors.stemHtml.message}
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor="defaultMark" required>
          {copy.quizAdmin.defaultMark}
        </Label>
        <Input id="defaultMark" type="number" step="0.5" min={0} {...form.register('defaultMark', { valueAsNumber: true })} />
      </div>

      {type !== 'essay' ? (
        <OptionRows type={type} options={options} onChange={setOptions} error={optionsIssue} />
      ) : null}

      <div>
        <Label htmlFor="generalFeedbackHtml">{copy.quizAdmin.generalFeedback}</Label>
        <Textarea id="generalFeedbackHtml" {...form.register('generalFeedbackHtml')} />
      </div>

      <div className="flex items-center justify-between border-t border-line-subtle pt-4">
        <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{copy.quizAdmin.shortcutsHint}</p>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {copy.quizAdmin.save}
        </Button>
      </div>
    </form>
  );
}
