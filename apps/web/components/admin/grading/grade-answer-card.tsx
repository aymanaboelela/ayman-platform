'use client';

import { useId, useState, useTransition } from 'react';
import { Check } from 'lucide-react';
// `/copy/admin`, never the root barrel — this card only renders inside /admin.
import { copy } from '@ayman/contracts/copy/admin';
import type { AdminGradingAttempt } from '@ayman/contracts/admin/exams';
import { formatCopy, formatMark } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Textarea } from '@ayman/ui/components/textarea';
import { cn } from '@ayman/ui/lib/cn';
import { SafeHtml } from '@/components/content/safe-html';
import { gradeAnswerAction } from '@/app/(admin)/admin/grading/actions';
import { useRefreshGradingPendingCount } from '@/components/admin/grading-alerts';

const c = copy.admin.grading;

/** One answer, derived from the payload rather than re-declared — the contract
 *  exports the attempt shape, not the row inside it. */
export type GradingQuestion = AdminGradingAttempt['questions'][number];

/** The contract's own ceiling on `feedbackHtml`, mirrored onto the box so the
 *  refusal happens under his fingers instead of after a round trip. */
const FEEDBACK_MAX = 20000;

export interface GradeAnswerCardProps {
  attemptId: string;
  question: GradingQuestion;
  /** Handed the attempt's recomputed `scaledScore` after every successful save.
   *  The total lives one level up (`grading-paper.tsx`) because marking ANY
   *  answer moves the same one number. */
  onGraded: (scaledScore: number | null) => void;
}

/**
 * One essay answer, and the box that turns it into a mark.
 *
 * ## The empty box is load-bearing
 *
 * `mark` arrives NULL for anything unmarked — never 0. «Unmarked» and «marked
 * zero» are different facts, and this screen exists to turn the first into the
 * second; a box that opened pre-filled with a zero nobody typed would let him
 * "confirm" a grade he never made, one Enter at a time. So an unmarked answer
 * renders an empty field, and the Save button stays disabled until something is
 * actually in it.
 *
 * A blank ANSWER is the mirror image and is deliberately not auto-zeroed
 * either: `gradeQuestion` never scores this type at all, so «ساب السؤال فاضي»
 * still needs a human to write the nought.
 *
 * ## Why the input does not enforce the maximum
 *
 * `ManualGradingService.grade` CLAMPS to the slot's `max_mark` rather than
 * refusing — an admin typing 20 into a 5-mark box is a slip, and a 400 halfway
 * through thirty papers is worse than the obvious correction. A `max` attribute
 * here would fight that: it marks the field `:invalid` and puts a browser
 * bubble in Arabic-adjacent English over a screen that has already decided what
 * to do about the number. So the ceiling is TEXT beside the field («من ٥»),
 * typing is never blocked, and the box is snapped to what the server actually
 * stored once the save returns — otherwise a 20 keeps reading «20» over a
 * stored 5, which is a worse lie than the one this feature came to fix.
 *
 * `step="any"` for the same reason: marks are `numeric(10,4)`, and a `step` of
 * 0.5 would make an ordinary half-mark-and-a-quarter invalid.
 */
export function GradeAnswerCard({ attemptId, question, onGraded }: GradeAnswerCardProps) {
  const fieldId = useId();
  const markId = `${fieldId}-mark`;
  const feedbackId = `${fieldId}-feedback`;

  const [mark, setMark] = useState(question.mark === null ? '' : formatMark(question.mark));
  const [feedback, setFeedback] = useState(question.feedbackHtml ?? '');
  const [chosenOptionIds, setChosenOptionIds] = useState<string[]>(() => question.chosenOptionIds ?? []);
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [pending, startTransition] = useTransition();
  const refreshPendingCount = useRefreshGradingPendingCount();

  const parsed = Number(mark);
  const canSave = mark.trim() !== '' && Number.isFinite(parsed);
  const outOf = formatCopy(c.markOutOf, { n: formatMark(question.maxMark) });

  const isChoice = Boolean(question.options && question.options.length > 0);

  function selectOption(optId: string, isRight?: boolean) {
    const nextIds = [optId];
    setChosenOptionIds(nextIds);
    // If the instructor changes the answer, suggest the corresponding mark
    if (isRight) {
      setMark(formatMark(question.maxMark));
    } else {
      setMark('0');
    }
    setStatus('idle');
  }

  function setQuickMark(value: number) {
    setMark(formatMark(value));
    setStatus('idle');
  }

  function save() {
    if (!canSave) return;
    setStatus('idle');

    startTransition(async () => {
      const trimmed = feedback.trim();
      const payload: { mark: number; feedbackHtml?: string; response?: unknown } = {
        mark: Math.max(parsed, 0),
        feedbackHtml: trimmed === '' ? undefined : trimmed,
      };

      if (isChoice) {
        payload.response = { kind: 'choice', optionIds: chosenOptionIds };
      }

      const result = await gradeAnswerAction(attemptId, question.attemptQuestionId, payload);

      if (!result.ok) {
        setStatus('failed');
        return;
      }

      setMark(formatMark(Math.min(Math.max(parsed, 0), question.maxMark)));
      setStatus('saved');
      onGraded(result.scaledScore);
      refreshPendingCount();
    });
  }

  return (
    <article className="rounded-xl border border-line bg-surface-2 p-4 sm:p-5 shadow-xs transition-all">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="mono text-[length:var(--fs-mono-label)] font-semibold text-fg-muted">
            سؤال {String(question.slotPosition + 1).padStart(2, '0')}
          </span>
          {question.type ? (
            <span className="rounded-md bg-surface-3 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
              {copy.quiz.kinds[question.type as keyof typeof copy.quiz.kinds] ?? question.type}
            </span>
          ) : null}
        </div>

        {question.correctness ? (
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[length:var(--fs-text-xs)] font-medium',
              question.correctness === 'correct' && 'bg-[color-mix(in_oklch,var(--ok),transparent_85%)] text-ok',
              question.correctness === 'incorrect' && 'bg-[color-mix(in_oklch,var(--err),transparent_85%)] text-err',
              question.correctness === 'partial' && 'bg-accent/15 text-accent-text',
              question.correctness === 'needs_grading' && 'bg-surface-3 text-fg-muted',
            )}
          >
            {question.correctness === 'correct'
              ? 'إجابة صحيحة ✓'
              : question.correctness === 'incorrect'
                ? 'إجابة خاطئة ✗'
                : question.correctness === 'partial'
                  ? 'إجابة جزئية'
                  : 'محتاجة تصحيح يدوي'}
          </span>
        ) : null}
      </div>

      <SafeHtml html={question.questionHtml} className="mt-3 text-fg leading-relaxed" />

      {/* Multiple Choice Options if available */}
      {isChoice && question.options ? (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-[length:var(--fs-text-xs)] font-medium text-fg-muted">
            الخيارات وإجابة الطالب (يمكنك تعديل الاختيار مباشرة كأدمن):
          </p>
          <ul className="flex flex-col gap-2">
            {question.options.map((option, index) => {
              const isSelected = chosenOptionIds.includes(option.id);
              const isRight = Boolean(option.isRight);

              return (
                <li
                  key={option.id}
                  onClick={() => selectOption(option.id, isRight)}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                    isSelected
                      ? 'border-accent bg-accent/10 shadow-xs'
                      : isRight
                        ? 'border-ok/40 bg-[color-mix(in_oklch,var(--ok),transparent_94%)]'
                        : 'border-line-subtle bg-surface-3 hover:bg-surface-1',
                  )}
                >
                  <span
                    className={cn(
                      'mono flex size-7 shrink-0 items-center justify-center rounded-md text-[length:var(--fs-text-sm)] font-bold',
                      isSelected
                        ? 'bg-accent text-accent-text'
                        : isRight
                          ? 'bg-ok/20 text-ok'
                          : 'bg-surface-2 text-fg-muted',
                    )}
                  >
                    {String.fromCharCode(0x0623 + index)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <SafeHtml html={option.bodyHtml} className="text-[length:var(--fs-text-sm)] text-fg" />

                    <div className="mt-1 flex flex-wrap gap-2 text-[length:var(--fs-text-xs)]">
                      {isRight ? (
                        <span className="font-semibold text-ok">
                          ✓ الإجابة الصحيحة النموذجية
                        </span>
                      ) : null}
                      {isSelected ? (
                        <span className="font-semibold text-accent-text">
                          ● اختيار الطالب المسجل
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        /* Text or Essay Student Answer */
        <div className="mt-4 rounded-[var(--r-md)] border border-line-subtle bg-surface-3 p-3">
          <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.studentAnswer}</p>
          {question.responseText === null || question.responseText.trim() === '' ? (
            <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-faint">{c.noAnswer}</p>
          ) : (
            <p className="mt-1 whitespace-pre-wrap text-[length:var(--fs-text-base)] leading-relaxed text-fg [overflow-wrap:anywhere]">
              {question.responseText}
            </p>
          )}
        </div>
      )}

      {/* Marks & Quick Score Buttons */}
      <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="w-28">
          <Label htmlFor={markId}>{c.markLabel}</Label>
          <Input
            id={markId}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={mark}
            onChange={(event) => {
              setMark(event.target.value);
              setStatus('idle');
            }}
            className="tabular-nums"
          />
        </div>
        <p className="pb-2.5 text-[length:var(--fs-text-sm)] text-fg-muted tabular-nums">{outOf}</p>

        {/* Quick buttons */}
        <div className="flex flex-wrap items-center gap-1.5 pb-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setQuickMark(question.maxMark)}
            className="text-[length:var(--fs-text-xs)]"
          >
            درجة كاملة ({formatMark(question.maxMark)})
          </Button>
          {question.maxMark > 1 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setQuickMark(question.maxMark / 2)}
              className="text-[length:var(--fs-text-xs)]"
            >
              نصف درجة ({formatMark(question.maxMark / 2)})
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setQuickMark(0)}
            className="text-[length:var(--fs-text-xs)]"
          >
            صفر (0)
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <Label htmlFor={feedbackId}>{c.feedbackLabel}</Label>
        <Textarea
          id={feedbackId}
          rows={2}
          maxLength={FEEDBACK_MAX}
          value={feedback}
          onChange={(event) => {
            setFeedback(event.target.value);
            setStatus('idle');
          }}
          className="min-h-20"
          placeholder="أضف ملاحظة أو توجيه للطالب حول هذا السؤال..."
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={save} disabled={pending || !canSave}>
          {c.save}
        </Button>

        {status === 'saved' ? (
          <p className="inline-flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-ok font-medium">
            <Check className="size-4" aria-hidden="true" />
            {c.saved}
          </p>
        ) : null}

        {status === 'failed' ? (
          <p role="alert" className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
            {c.saveFailed}
          </p>
        ) : null}
      </div>
    </article>
  );
}
