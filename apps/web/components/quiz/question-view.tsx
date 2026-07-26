'use client';

import { copy, formatCopy, type Correctness } from '@ayman/contracts';
import { Button, Checkbox, RadioGroup, RadioGroupItem, Textarea, cn } from '@ayman/ui';
import { RichText } from '@/components/content/rich-text';
import type { AnswerResponse } from './use-attempt-autosave';

export interface QuestionViewOption {
  id: string;
  bodyHtml: string;
}

export interface QuestionViewData {
  slotPosition: number;
  type: 'mcq_single' | 'mcq_multi' | 'true_false' | 'short_answer' | 'essay';
  stemHtml: string;
  maxMark: number;
  options: QuestionViewOption[];
  flagged: boolean;
  settings: { minWords?: number; maxWords?: number };
}

/**
 * Practice mode's instant per-question result. The UI renders exactly what
 * the server sent — every field here is present only because the review
 * matrix's `during` window permitted it (`AttemptService.checkAnswer`); it
 * never branches on a boolean "show correctness" prop.
 */
export interface CheckResult {
  correctness?: Correctness;
  feedbackHtml?: string;
  rightAnswerText?: string;
}

const CORRECTNESS_LABEL: Record<Correctness, string> = {
  correct: copy.quiz.correct,
  partial: copy.quiz.partial,
  incorrect: copy.quiz.incorrect,
  needsGrading: copy.quiz.needsGrading,
  unanswered: copy.quiz.notAnswered,
};

/**
 * Deliberately NOT `--ok`/`--err` here — those are reserved for the results
 * and review screens (`result-header.tsx`/`review-question.tsx`, Task 18)
 * and nowhere else in the product. Practice mode's instant verdict is
 * conveyed by an icon shape (a check vs. an x) and the copy label alone.
 */
const CORRECTNESS_ICON: Partial<Record<Correctness, 'check' | 'cross'>> = {
  correct: 'check',
  incorrect: 'cross',
};

export interface QuestionViewProps {
  question: QuestionViewData;
  response: AnswerResponse | null;
  onChange: (response: AnswerResponse | null) => void;
  onToggleFlag: () => void;
  /** Practice mode only. `null` = not checked yet; presence of a field is
   *  gated server-side, not by this component. */
  checkResult?: CheckResult | null;
  onCheck?: () => void;
  checking?: boolean;
}

function wordCount(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

/**
 * Options render in the SNAPSHOTTED order the API sent — `question.options`
 * is never re-sorted client-side, because that order is what makes "resume
 * five times, identical option order" true from the student's side too.
 */
export function QuestionView({
  question,
  response,
  onChange,
  onToggleFlag,
  checkResult,
  onCheck,
  checking,
}: QuestionViewProps) {
  const isChoice = question.type === 'mcq_single' || question.type === 'true_false';
  const isMulti = question.type === 'mcq_multi';
  const isText = question.type === 'short_answer' || question.type === 'essay';
  // Locked the instant it's been checked — practice mode's instant feedback
  // without a lock is "guess until green", which defeats the point.
  const locked = Boolean(checkResult);

  const chosenIds = response && response.kind === 'choice' ? response.optionIds : [];
  const text = response && response.kind === 'text' ? response.text : '';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <RichText html={question.stemHtml} className="max-w-[var(--w-prose)] text-fg" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleFlag}
          aria-pressed={question.flagged}
          className={cn(question.flagged && 'text-accent-text')}
        >
          {question.flagged ? copy.quiz.unflag : copy.quiz.flag}
        </Button>
      </div>

      {isChoice ? (
        <RadioGroup
          value={chosenIds[0]}
          onValueChange={(value) => onChange({ kind: 'choice', optionIds: [value] })}
        >
          <ul className="flex flex-col gap-2">
            {question.options.map((option) => (
              <li key={option.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-line-subtle bg-surface-2 p-3 hover:border-line-strong data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60">
                  <RadioGroupItem value={option.id} disabled={locked} className="mt-0.5" />
                  <RichText html={option.bodyHtml} />
                </label>
              </li>
            ))}
          </ul>
        </RadioGroup>
      ) : null}

      {isMulti ? (
        <ul className="flex flex-col gap-2">
          {question.options.map((option) => {
            const checked = chosenIds.includes(option.id);
            return (
              <li key={option.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-line-subtle bg-surface-2 p-3 hover:border-line-strong">
                  <Checkbox
                    className="mt-0.5"
                    checked={checked}
                    disabled={locked}
                    onCheckedChange={(next) => {
                      const nextIds = next ? [...chosenIds, option.id] : chosenIds.filter((id) => id !== option.id);
                      onChange(nextIds.length > 0 ? { kind: 'choice', optionIds: nextIds } : null);
                    }}
                  />
                  <RichText html={option.bodyHtml} />
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}

      {isText ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={text}
            disabled={locked}
            onChange={(event) => {
              const value = event.target.value;
              onChange(value.length > 0 ? { kind: 'text', text: value } : null);
            }}
            aria-label={copy.quiz.typeAnswer}
            className={cn(question.type === 'essay' && 'min-h-56')}
          />
          <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
            {formatCopy(copy.quiz.wordCount, { n: wordCount(text) })}
          </p>
        </div>
      ) : null}

      {!locked ? (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={response === null}
            className="text-[length:var(--fs-text-sm)] text-fg-muted underline decoration-dotted hover:text-fg disabled:pointer-events-none disabled:opacity-50"
          >
            {copy.quiz.clearAnswer}
          </button>
          {onCheck ? (
            <Button type="button" variant="secondary" size="sm" onClick={onCheck} disabled={checking || response === null}>
              {copy.quiz.checkAnswer}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Renders exactly what the server sent — branches on FIELD PRESENCE,
          never on a boolean "show correctness" prop (the CSS-hiding pattern
          the spec bans). */}
      {checkResult ? (
        <div className="flex flex-col gap-2 rounded-sm border border-line-subtle bg-surface-2 p-3">
          {checkResult.correctness ? (
            <p className="flex items-center gap-2 font-medium text-fg">
              {CORRECTNESS_ICON[checkResult.correctness] === 'check' ? (
                <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8.5 6.5 12 13 4.5" />
                </svg>
              ) : CORRECTNESS_ICON[checkResult.correctness] === 'cross' ? (
                <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M3 3l10 10M13 3 3 13" />
                </svg>
              ) : null}
              {CORRECTNESS_LABEL[checkResult.correctness]}
            </p>
          ) : null}
          {checkResult.feedbackHtml ? (
            <div>
              <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{copy.quiz.questionFeedback}</p>
              <RichText html={checkResult.feedbackHtml} />
            </div>
          ) : null}
          {checkResult.rightAnswerText ? (
            <p className="text-fg">
              <span className="text-fg-muted">{copy.quiz.rightAnswer}: </span>
              {checkResult.rightAnswerText}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
