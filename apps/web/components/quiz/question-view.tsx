'use client';

import { copy, formatCopy } from '@ayman/contracts';
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

export interface QuestionViewProps {
  question: QuestionViewData;
  response: AnswerResponse | null;
  onChange: (response: AnswerResponse | null) => void;
  onToggleFlag: () => void;
  /**
   * «بيتحفظ…» / «اتحفظ». Rendered beside «امسح إجابتي» rather than beside the
   * clock, because it is feedback about THIS ANSWER — putting it next to the
   * countdown attached a second, unrelated word to the one number a student
   * glances up for mid-exam.
   */
  saveStatus: string;
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
  saveStatus,
}: QuestionViewProps) {
  const isChoice = question.type === 'mcq_single' || question.type === 'true_false';
  const isMulti = question.type === 'mcq_multi';
  const isText = question.type === 'short_answer' || question.type === 'essay';

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
                <label className="runner-option">
                  <RadioGroupItem value={option.id} className="mt-0.5" />
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
                <label className="runner-option">
                  <Checkbox
                    className="mt-0.5"
                    checked={checked}
                   
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

      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={response === null}
          className="text-[length:var(--fs-text-sm)] text-fg-muted underline decoration-dotted hover:text-fg disabled:pointer-events-none disabled:opacity-50"
        >
          {copy.quiz.clearAnswer}
        </button>
        <p aria-live="polite" className="mono text-[length:var(--fs-mono-label)] text-fg-faint">
          {saveStatus}
        </p>
      </div>
    </div>
  );
}
