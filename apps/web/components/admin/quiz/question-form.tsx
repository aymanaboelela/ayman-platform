'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  QUESTION_TYPES,
  QuestionInputSchema,
  hasChoiceOptions,
  type QuestionInput,
  type QuestionType,
} from '@ayman/contracts/quiz/question';
import { editableToHtml, htmlToEditable } from '@ayman/contracts/quiz/rich-text';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Textarea } from '@ayman/ui/components/textarea';
import { apiPatch, apiPost } from '@/lib/api';
import { OptionRows, type OptionRowValue } from './option-rows';

/**
 * The parts of the write response a caller needs back.
 *
 * `versionId` is here for `NewQuestionDialog`, which publishes the question it
 * just wrote — `POST /api/admin/questions/:versionId/publish` is keyed on the
 * VERSION, not the entry, because a bank entry can hold several drafts and only
 * one of them is being made ready. `QuestionBankService.create` has always
 * returned it; this schema simply stopped narrowing it away.
 */
const SavedQuestionSchema = z.object({ bankEntryId: z.string(), versionId: z.string() });

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
  /**
   * Called INSTEAD of navigating to the saved question. `defaultMark` is
   * passed alongside the ids because a caller attaching this question to a
   * quiz needs a mark for the slot, and the write response does not carry one
   * — it is the instructor's own number, straight off the form they just
   * filled in.
   */
  onSaved?: (result: { bankEntryId: string; versionId: string; defaultMark: number }) => void;
  /**
   * Rendered INSIDE the quiz builder's row rather than on its own page.
   *
   * Two things change, and both are about the form no longer owning the
   * screen it sits on:
   *
   * - `defaultMark` is hidden. It is the BANK's default, read once when a slot
   *   is created and never again; the number that decides this exam is the
   *   slot's own `maxMark`, which the panel edits beside this form. Showing
   *   both invites editing the one that does nothing.
   * - `Escape` stops navigating to /admin/questions. In a panel, Escape means
   *   "close this", and taking the instructor out of the exam they are
   *   building is the opposite of what the key is for. The panel binds it.
   */
  embedded?: boolean;
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

/**
 * `stemHtml`, `bodyHtml` and `generalFeedbackHtml` are HTML columns, and this
 * form used to bind them to a `<Textarea>`/`<Input>` raw — so opening an
 * imported or seeded question showed the instructor
 * `<p>Storage ثم RAM ثم Cache ثم CPU</p>` and asked them to edit that. On an
 * RTL page the Latin tags and the Arabic content reorder against each other
 * under bidi, dropping `</p>` into the middle of the sentence, and an ordering
 * question becomes genuinely unreadable — there is no telling which end of it
 * is the beginning. Every other admin surface already strips the markup
 * (`stripHtml` in slot-list.tsx, add-slot-dialog.tsx); this is the last one
 * that did not.
 *
 * The pair is symmetric: markup the field was SHOWN (anything richer than
 * paragraphs, which `htmlToEditable` deliberately does not unwrap) passes back
 * through untouched, so saving a question nobody edited rewrites nothing.
 */
function toEditable(values: QuestionInput): QuestionInput {
  return {
    ...values,
    stemHtml: htmlToEditable(values.stemHtml),
    ...(values.generalFeedbackHtml
      ? { generalFeedbackHtml: htmlToEditable(values.generalFeedbackHtml) }
      : {}),
    options: values.options.map((option) =>
      'bodyHtml' in option ? { ...option, bodyHtml: htmlToEditable(option.bodyHtml) } : option,
    ),
  } as QuestionInput;
}

function toStored(values: QuestionInput): QuestionInput {
  return {
    ...values,
    stemHtml: editableToHtml(values.stemHtml),
    ...(values.generalFeedbackHtml
      ? { generalFeedbackHtml: editableToHtml(values.generalFeedbackHtml) }
      : {}),
    // `answerPattern` is NOT html and is left alone — the same reason
    // `QuestionBankService` refuses to sanitize it: encoding `<` would change
    // what the pattern matches.
    options: values.options.map((option) =>
      'bodyHtml' in option ? { ...option, bodyHtml: editableToHtml(option.bodyHtml) } : option,
    ),
  } as QuestionInput;
}

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
export function QuestionForm({
  categories,
  bankEntryId,
  defaultValues,
  onSaved,
  embedded = false,
}: QuestionFormProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The form's fields hold TEXT, not markup — `toStored` puts the markup back
  // on the way out. `useMemo` and not `useState`: the two consumers below both
  // read it on the first render only, and recomputing it if the caller ever
  // passes a new question is what the identity is for.
  const editableDefaults = useMemo(
    () => (defaultValues ? toEditable(defaultValues) : undefined),
    [defaultValues],
  );
  const [options, setOptionsState] = useState<OptionRowValue[]>(() =>
    withClientIds((editableDefaults ?? DEFAULT_MCQ).options as readonly { id?: string }[]),
  );

  const form = useForm<QuestionFormValues, unknown, QuestionInput>({
    resolver: zodResolver(QuestionInputSchema),
    defaultValues: editableDefaults ?? {
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
    } else if (next === 'ordering') {
      // The bodies survive the switch — an instructor turning four MCQ options
      // into a sequence wrote those four items already. The weights are
      // zeroed, because an ordering option has nothing to be worth (see
      // `OrderingSchema`), and a third row is added when there are too few.
      const kept = options.filter((option) => option.bodyHtml !== undefined);
      const rows = kept.length >= 3 ? kept : [...kept, ...Array.from({ length: 3 - kept.length }, () => ({ id: crypto.randomUUID(), bodyHtml: '' }))];
      setOptions(rows.map((option) => ({ ...option, bodyHtml: option.bodyHtml ?? '', fraction: 0 })));
    } else if (next === 'short_answer') {
      setOptions([{ id: crypto.randomUUID(), answerPattern: '', fraction: 1 }]);
    } else if (next === 'essay') {
      setOptions([]);
    } else if (!hasChoiceOptions(type)) {
      setOptions([
        { id: crypto.randomUUID(), bodyHtml: '', fraction: 1 },
        { id: crypto.randomUUID(), bodyHtml: '', fraction: 0 },
      ]);
      // (`true_false` never reaches here — the first branch rebuilds its two
      // options outright.)
    } else if (next === 'mcq_single' && type === 'ordering') {
      // Coming BACK from ordering, every row carries a weight of 0 — correct
      // there (nothing is worth anything on its own) and `exactlyOneCorrect`'s
      // failure case here. Marking the first row correct leaves a form the
      // instructor fixes with one click on the radio they can already see,
      // instead of an error about a rule with no control attached to it.
      setOptions(options.map((option, index) => ({ ...option, fraction: index === 0 ? 1 : 0 })));
    }
    form.clearErrors();
  }

  async function onSubmit(values: QuestionInput) {
    setSubmitError(null);
    const payload = toStored(values);
    try {
      const result = bankEntryId
        ? SavedQuestionSchema.parse(await apiPatch(`/api/admin/questions/${bankEntryId}`, payload))
        : await apiPost('/api/admin/questions', SavedQuestionSchema, payload);
      toast.success(copy.admin.common.saved);
      if (onSaved) onSaved({ ...result, defaultMark: values.defaultMark });
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
    // Not `embedded`: the panel that hosts this form owns Escape, and letting
    // it bubble is what lets the panel close instead of the page changing.
    if (event.key === 'Escape' && !embedded) {
      event.preventDefault();
      router.push('/admin/questions');
    }
  }

  const optionsIssue = form.formState.errors.options?.message as string | undefined;
  const hasAnyError = Object.keys(form.formState.errors).length > 0;

  return (
    <form method="post" onSubmit={form.handleSubmit(onSubmit)} onKeyDown={onKeyDown} className="max-w-[var(--w-prose)] space-y-5">
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

      {/* Registered either way — `QuestionInputSchema` requires it, and a
          field that is not registered submits as undefined and fails
          validation with no visible error to point at. Hidden, not omitted. */}
      <div hidden={embedded}>
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
