'use client';

import { useId, useState, type FormEvent } from 'react';
import { CheckCircle2, Eye, ListChecks, Plus, ToggleLeft, X } from 'lucide-react';
import { formatCopy } from '@ayman/contracts/format';
import { adminPractice as c } from '@ayman/contracts/copy/admin-practice';
import type { PracticeQuestion, PracticeQuestionInput, PracticeQuestionType } from '@ayman/contracts/practice';
import { Button } from '@ayman/ui/components/button';
import { Textarea } from '@ayman/ui/components/textarea';
import { cn } from '@ayman/ui/lib/cn';
import { optionLetter } from '@/components/quiz/option-letter';
import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  checkDraft,
  draftFromQuestion,
  emptyDraft,
  type DraftErrors,
  type QuestionDraft,
} from './practice-model';
import { QuestionExplanation, QuestionOptions } from './question-body';

const q = c.question;

/**
 * One question, written or rewritten — the same form for «إضافة سؤال» and for
 * «تعديل» on a card.
 *
 * ## The key is chosen, never defaulted
 *
 * `answer` starts `null` and the form refuses to save until a radio is
 * pressed. Defaulting to «أ» is how a set ships with every question keyed on
 * the first option: the instructor types four options, presses save, and the
 * form had already "answered" for him.
 *
 * ## Errors appear after the first save attempt, then follow the typing
 *
 * Red under an empty field the moment the form opens reads as a scolding;
 * silence after a refused save reads as a broken button. So the checks run on
 * submit, and once shown they re-run on every keystroke until they clear.
 *
 * The live preview beside the fields is the visitor's card, key highlighted,
 * so «الإجابة الصح هي ج» is checked against the words, not the letter.
 */
export function QuestionEditor({
  initial,
  number,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  /** The saved question when editing; omitted for a new one. */
  initial?: PracticeQuestion | null;
  /** «سؤال 4» in the heading; omitted for a new one. */
  number?: number;
  submitLabel: string;
  /** Resolves `true` when saved — a new-question form then clears for the next one. */
  onSubmit: (input: PracticeQuestionInput) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<QuestionDraft>(() => (initial ? draftFromQuestion(initial) : emptyDraft()));
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = checkDraft(draft);
  const errors: DraftErrors = shown && !check.ok ? check.errors : {};

  function update(next: Partial<QuestionDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function setType(type: PracticeQuestionType) {
    if (type === draft.type) return;
    // The key does not survive a type switch: «ج» has no meaning on صح/غلط,
    // and carrying `answer: 1` across would silently key «غلط».
    update({ type, answer: null });
  }

  function setOption(index: number, value: string) {
    update({ options: draft.options.map((option, at) => (at === index ? value : option)) });
  }

  function addOption() {
    if (draft.options.length >= MAX_OPTIONS) return;
    update({ options: [...draft.options, ''] });
  }

  function removeOption(index: number) {
    if (draft.options.length <= MIN_OPTIONS) return;
    // The key follows its own text: removing a row above it moves it up one.
    const answer =
      draft.answer === null || draft.answer === index ? null : draft.answer > index ? draft.answer - 1 : draft.answer;
    update({ options: draft.options.filter((_, at) => at !== index), answer });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setShown(true);
    if (!check.ok) return;
    setBusy(true);
    try {
      const saved = await onSubmit(check.input);
      if (saved && !initial) {
        setDraft(emptyDraft(draft.type));
        setShown(false);
      }
    } finally {
      setBusy(false);
    }
  }

  const heading = number ? formatCopy(q.number, { n: number }) : c.editor.add;
  const previewOptions = draft.type === 'mcq' ? draft.options : [];

  return (
    <form className="prx-qform" onSubmit={submit} noValidate aria-label={heading}>
      <div className="prx-qform__fields">
        <p className="prx-panel__title">
          <span className="prx-panel__well" aria-hidden="true">
            <Plus className="size-4" />
          </span>
          {heading}
        </p>

        <div className="prx-field">
          <span className="prx-field__label" id={`${id}-type`}>
            {q.typeLabel}
          </span>
          <div className="prx-type-toggle" role="group" aria-labelledby={`${id}-type`}>
            <button
              type="button"
              className="prx-type-toggle__item"
              aria-pressed={draft.type === 'mcq'}
              onClick={() => setType('mcq')}
            >
              <ListChecks className="size-4" aria-hidden="true" />
              {q.typeToggle.mcq}
            </button>
            <button
              type="button"
              className="prx-type-toggle__item prx-type-toggle__item--tf"
              aria-pressed={draft.type === 'tf'}
              onClick={() => setType('tf')}
            >
              <ToggleLeft className="size-4" aria-hidden="true" />
              {q.typeToggle.tf}
            </button>
          </div>
        </div>

        <div className="prx-field">
          <label className="prx-field__label" htmlFor={`${id}-stem`}>
            {q.stem}
          </label>
          <Textarea
            id={`${id}-stem`}
            value={draft.stem}
            onChange={(event) => update({ stem: event.target.value })}
            placeholder={q.stemPlaceholder}
            rows={3}
            maxLength={1000}
            dir="auto"
            aria-invalid={errors.stem ? true : undefined}
            aria-describedby={errors.stem ? `${id}-stem-error` : undefined}
          />
          {errors.stem ? (
            <p id={`${id}-stem-error`} role="alert" className="prx-error">
              {errors.stem}
            </p>
          ) : null}
        </div>

        {draft.type === 'mcq' ? (
          <fieldset className="prx-field">
            <legend className="prx-field__label">{q.options}</legend>
            <p className="prx-hint">{q.optionsHint}</p>
            <div className="mt-2 flex flex-col gap-2">
              {draft.options.map((option, index) => {
                const letter = optionLetter(index);
                const right = draft.answer === index;
                return (
                  <div key={index} className={cn('prx-orow', right && 'prx-orow--right')}>
                    <input
                      type="radio"
                      name={`${id}-answer`}
                      checked={right}
                      onChange={() => update({ answer: index })}
                      aria-label={formatCopy(q.markCorrect, { letter })}
                    />
                    <span className="prx-opt__letter" aria-hidden="true">
                      {letter}
                    </span>
                    <input
                      type="text"
                      className="prx-orow__input"
                      value={option}
                      onChange={(event) => setOption(index, event.target.value)}
                      maxLength={400}
                      dir="auto"
                      aria-label={formatCopy(q.optionLabel, { letter })}
                    />
                    <button
                      type="button"
                      className="prx-icon-btn"
                      onClick={() => removeOption(index)}
                      disabled={draft.options.length <= MIN_OPTIONS}
                      aria-label={formatCopy(q.removeOption, { letter })}
                      title={formatCopy(q.removeOption, { letter })}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
            {draft.options.length < MAX_OPTIONS ? (
              <button type="button" className="chip prx-plain mt-2 self-start" onClick={addOption}>
                <Plus className="size-4" aria-hidden="true" />
                {q.addOption}
              </button>
            ) : null}
            {errors.options ? (
              <p role="alert" className="prx-error">
                {errors.options}
              </p>
            ) : null}
          </fieldset>
        ) : (
          <fieldset className="prx-field">
            <legend className="prx-field__label">{q.tfAnswer}</legend>
            <div className="prx-tf mt-1">
              {[q.true, q.false].map((label, index) => (
                <label key={label} className={cn('prx-tf__item', draft.answer === index && 'prx-tf__item--right')}>
                  <input
                    type="radio"
                    name={`${id}-tf`}
                    checked={draft.answer === index}
                    onChange={() => update({ answer: index })}
                  />
                  {label}
                  {draft.answer === index ? (
                    <CheckCircle2 className="ms-auto size-4 text-[color:var(--ok)]" aria-hidden="true" />
                  ) : null}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {errors.answer ? (
          <p role="alert" className="prx-error">
            {errors.answer}
          </p>
        ) : null}

        <div className="prx-field">
          <label className="prx-field__label" htmlFor={`${id}-explanation`}>
            {q.explanation}
          </label>
          <Textarea
            id={`${id}-explanation`}
            value={draft.explanation}
            onChange={(event) => update({ explanation: event.target.value })}
            rows={2}
            maxLength={1500}
            dir="auto"
          />
          <p className="prx-hint">{q.explanationHint}</p>
          {errors.explanation ? (
            <p role="alert" className="prx-error">
              {errors.explanation}
            </p>
          ) : null}
        </div>

        <div className="prx-qform__actions">
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              {q.cancel}
            </Button>
          ) : null}
          <Button type="submit" disabled={busy}>
            {submitLabel}
          </Button>
        </div>
      </div>

      <div className="prx-preview" aria-live="polite">
        <span className="prx-preview__label">
          <Eye className="size-3.5" aria-hidden="true" />
          {q.preview}
        </span>
        <div className="prx-preview__card">
          {draft.stem.trim() === '' ? (
            <p className="prx-preview__stem prx-preview__stem--empty">{q.previewEmpty}</p>
          ) : (
            <p className="prx-preview__stem" dir="auto">
              {draft.stem.trim()}
            </p>
          )}
          <QuestionOptions
            type={draft.type}
            options={draft.type === 'mcq' ? previewOptions.filter((option) => option.trim() !== '') : []}
            answer={previewAnswer(draft)}
          />
          <QuestionExplanation text={draft.explanation} />
        </div>
      </div>
    </form>
  );
}

/** The key's position among the options the preview actually draws (blank rows dropped). */
function previewAnswer(draft: QuestionDraft): number | null {
  if (draft.answer === null) return null;
  if (draft.type === 'tf') return draft.answer;
  if (draft.options[draft.answer]?.trim() === '') return null;
  return draft.options.slice(0, draft.answer).filter((option) => option.trim() !== '').length;
}
