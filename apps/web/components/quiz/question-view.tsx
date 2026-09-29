'use client';

import { memo, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Flag } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { RadioGroup, RadioGroupItem } from '@ayman/ui/components/radio-group';
import { Textarea } from '@ayman/ui/components/textarea';
import { cn } from '@ayman/ui/lib/cn';
import { SafeHtml } from '@/components/content/safe-html';
import { optionLetter } from './option-letter';
import type { AnswerResponse } from './use-attempt-autosave';

/**
 * ~40-50 KB gzip of drag-and-drop, loaded only by a paper that actually
 * contains an ordering question.
 *
 * `ordering-list.tsx` statically imports `@dnd-kit/core`, `/modifiers`,
 * `/sortable` and `/utilities`. Imported statically from here, every attempt of
 * every quiz downloaded, parsed and hydrated all four — and an ordering
 * question is rare. The branch that renders it was already conditional; only
 * the import was not.
 *
 * `ssr: false` because the list is interactive and has nothing to contribute to
 * the first paint. The `loading` fallback holds no height on purpose: the
 * questions arrive with the page, so this resolves within a frame or two of the
 * branch being taken, and a placeholder box would flash on a screen that must
 * not move under a student's thumb.
 */
const OrderingList = dynamic(
  () => import('./ordering-list').then((module) => module.OrderingList),
  { ssr: false, loading: () => null },
);

export interface QuestionViewOption {
  id: string;
  bodyHtml: string;
}

export interface QuestionViewData {
  slotPosition: number;
  type: 'mcq_single' | 'mcq_multi' | 'true_false' | 'short_answer' | 'ordering' | 'essay';
  stemHtml: string;
  maxMark: number;
  options: QuestionViewOption[];
  flagged: boolean;
  settings: { minWords?: number; maxWords?: number };
}

export interface QuestionViewProps {
  question: QuestionViewData;
  /** 1-based, as the student counts — «سؤال ٣». A number, so the memo holds. */
  number: number;
  response: AnswerResponse | null;
  onChange: (response: AnswerResponse | null) => void;
  onToggleFlag: () => void;
  /**
   * «بيتحفظ…» / «اتحفظ». Rendered beside «مسح إجابتي» rather than beside the
   * clock, because it is feedback about THIS ANSWER — putting it next to the
   * countdown attached a second, unrelated word to the one number a student
   * glances up for mid-exam.
   */
  saveStatus: string;
}

/**
 * One `trim()`, not three.
 *
 * It read `text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length` and
 * was called unmemoised straight from the JSX, so every character typed into an
 * essay trimmed the whole answer twice and split it once — three full passes
 * over a string that only ever grows. The count is memoised at the call site
 * too; both halves are needed, because the memo cannot help if the function is
 * cubic in the answer's length.
 */
function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Options render in the SNAPSHOTTED order the API sent — `question.options`
 * is never re-sorted client-side, because that order is what makes "resume
 * five times, identical option order" true from the student's side too.
 */
function QuestionViewImpl({
  question,
  number,
  response,
  onChange,
  onToggleFlag,
  saveStatus,
}: QuestionViewProps) {
  const isChoice = question.type === 'mcq_single' || question.type === 'true_false';
  const isMulti = question.type === 'mcq_multi';
  const isOrdering = question.type === 'ordering';
  const isText = question.type === 'short_answer' || question.type === 'essay';

  const chosenIds = response && response.kind === 'choice' ? response.optionIds : [];
  const text = response && response.kind === 'text' ? response.text : '';
  // Recomputed when the answer changes and not on every render of the card —
  // see `wordCount` above for why scanning the whole essay per keystroke got
  // expensive precisely as the answer got long enough to matter.
  const words = useMemo(() => wordCount(text), [text]);

  return (
    <div className="flex flex-col gap-5">
      {/*
        The card's head: which question, what kind of answer it wants, what it
        is worth — and the flag, pushed to the far end.

        «إجابة واحدة بس» versus «ممكن أكتر من إجابة» is the one fact about a
        choice question the student could not see before: a radio and a
        checkbox are 20px apart in shape and nobody reads them. Said in words,
        on every question, before the options.

        It WRAPS rather than squeezing. The flag used to sit beside the stem in
        one row, and at 360px the flex algorithm shrank both until «علّم
        السؤال» broke over two lines inside a box locked to `h-10` and the stem
        was left ~190px of measure. Here the stem has the whole card below the
        head, and on a narrow phone the flag drops to its own line before any
        chip breaks mid-word (`whitespace-nowrap` on `Button` and on the chips).

        The flag's pressed state is told by FILL as well as by colour — the
        icon fills — so it survives a student who cannot separate the two
        hues. The label still changes, and `aria-pressed` says it to a screen
        reader.
      */}
      <div className="qhead">
        <span className="qhead__num">{formatCopy(copy.quiz.questionNumber, { n: number })}</span>
        <span className="qhead__chip">{copy.quiz.kinds[question.type]}</span>
        <span className="qhead__chip qhead__chip--mark">{formatCopy(copy.quiz.questionMarks, { n: question.maxMark })}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleFlag}
          aria-pressed={question.flagged}
          className={cn('qhead__flag shrink-0', question.flagged && 'text-accent-text')}
        >
          <Flag className="size-4" aria-hidden="true" fill={question.flagged ? 'currentColor' : 'none'} />
          {question.flagged ? copy.quiz.unflag : copy.quiz.flag}
        </Button>
      </div>

      <SafeHtml html={question.stemHtml} className="qcard__stem min-w-0" />

      {isChoice ? (
        <RadioGroup
          /*
            `?? ''` and never bare `chosenIds[0]`. An unanswered question has an
            empty `chosenIds`, so the index read is `undefined` — and a Radix
            `Root` given `value={undefined}` decides it is UNCONTROLLED for the
            rest of its life. Answering it hands the same instance a string, and
            React logs "RadioGroup is changing from uncontrolled to controlled";
            «مسح إجابتي» sets the response back to null and it logs the
            reverse. A student working through a paper produced one of those per
            answer and per clear, which is the flood in the console.

            The empty string is a value no option carries, so "controlled, with
            nothing selected" is expressed without ever going undefined.
          */
          value={chosenIds[0] ?? ''}
          onValueChange={(value) => onChange({ kind: 'choice', optionIds: [value] })}
        >
          <ul className="runner-options flex flex-col gap-2">
            {question.options.map((option, index) => (
              <li key={option.id}>
                <label className="runner-option">
                  <span className="runner-option__letter">{optionLetter(index)}</span>
                  <SafeHtml html={option.bodyHtml} className="runner-option__body" />
                  <RadioGroupItem value={option.id} className="runner-option__control" />
                </label>
              </li>
            ))}
          </ul>
        </RadioGroup>
      ) : null}

      {isMulti ? (
        <ul className="runner-options flex flex-col gap-2">
          {question.options.map((option, index) => {
            const checked = chosenIds.includes(option.id);
            return (
              <li key={option.id}>
                <label className="runner-option">
                  <span className="runner-option__letter">{optionLetter(index)}</span>
                  <SafeHtml html={option.bodyHtml} className="runner-option__body" />
                  <Checkbox
                    className="runner-option__control"
                    checked={checked}
                    onCheckedChange={(next) => {
                      const nextIds = next ? [...chosenIds, option.id] : chosenIds.filter((id) => id !== option.id);
                      onChange(nextIds.length > 0 ? { kind: 'choice', optionIds: nextIds } : null);
                    }}
                  />
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}

      {isOrdering ? (
        <OrderingList
          options={question.options}
          value={chosenIds}
          /*
            Every move saves the WHOLE sequence, which is what makes an
            ordering answer atomic: there is no half-written order to grade.
            An untouched question stays `null` — the served order is a
            shuffle, not an answer, and counting it as one would mark a
            student as having answered a question they never looked at (and
            hand full credit to whoever the shuffle happened to favour).
          */
          onChange={(optionIds) => onChange({ kind: 'choice', optionIds })}
        />
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
            {formatCopy(copy.quiz.wordCount, { n: words })}
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

/**
 * Memoised, and the props are the reason it can be.
 *
 * `QuizRunner` holds every answer at the top of its tree, so a single keystroke
 * re-rendered the runner and — with no memo anywhere — this whole card with it:
 * the stem, every option, the flag button and the clear control, on every
 * character of an essay. On a mid-range Android that is the «بيلاج وأنا بحل
 * الامتحان» a student actually feels.
 *
 * ⚠️ This only works because the runner now passes STABLE props. `question` is
 * a `useMemo`, the three handlers are `useCallback`s, and `response` is read
 * straight out of state. Reintroduce an inline `{...current, flagged}` object
 * or an arrow in the JSX over there and this memo silently stops matching on
 * every render — no error, no warning, just the old behaviour back.
 */
export const QuestionView = memo(QuestionViewImpl);
