'use client';

import { useId, useState, useTransition } from 'react';
import { AlertCircle, ArrowLeft, Check, Pencil, X } from 'lucide-react';
// `/copy/admin`, never the root barrel — this card only renders inside /admin.
import { copy } from '@ayman/contracts/copy/admin';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { adminGrading } from '@ayman/contracts/copy/admin-grading';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import type { AdminGradingAttempt } from '@ayman/contracts/admin/exams';
import { formatCopy, formatMark } from '@ayman/contracts/format';
import { gradeChoice, type ChoiceType } from '@ayman/contracts/quiz/choice-grade';
import { Button } from '@ayman/ui/components/button';
import { Checkbox } from '@ayman/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@ayman/ui/components/radio-group';
import { Textarea } from '@ayman/ui/components/textarea';
import { cn } from '@ayman/ui/lib/cn';
import { SafeHtml } from '@/components/content/safe-html';
import { optionLetter } from '@/components/quiz/option-letter';
import { gradeAnswerAction } from '@/app/(admin)/admin/grading/actions';
import { useRefreshGradingPendingCount } from '@/components/admin/grading-alerts';
import { verdictFromState, type Verdict } from './verdict';

const c = copy.admin.grading;
const g = adminGrading;

/** One answer, derived from the payload rather than re-declared — the contract
 *  exports the attempt shape, not the row inside it. */
export type GradingQuestion = AdminGradingAttempt['questions'][number];

/** The contract's own ceiling on `feedbackHtml`, mirrored onto the box so the
 *  refusal happens under his fingers instead of after a round trip. */
const FEEDBACK_MAX = 20000;

/** The question types whose recorded answer the instructor may correct —
 *  `CORRECTABLE_TYPES` on the API, which refuses anything else. */
const SINGLE = new Set(['mcq_single', 'true_false']);
const MULTI = 'mcq_multi';


export interface GradeAnswerCardProps {
  attemptId: string;
  question: GradingQuestion;
  /** Handed the attempt's recomputed `scaledScore` after every successful save.
   *  The total lives one level up (`grading-paper.tsx`) because marking ANY
   *  answer moves the same one number. */
  onGraded: (scaledScore: number | null) => void;
}

/** Same thresholds as the API's `fractionToState`, for the chip after a save. */
function verdictFor(mark: number, maxMark: number): Verdict {
  const fraction = maxMark > 0 ? mark / maxMark : 0;
  if (fraction < 0.000001) return 'incorrect';
  if (fraction >= 0.999999) return 'correct';
  return 'partial';
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/**
 * Marks compared at the precision the box SHOWS them (`formatMark`, two
 * places): an engine mark of 0.6667 opens as «0.67», and a note saved under it
 * must not read as a new mark, ask to overwrite it, or be sent as one.
 */
function sameShownMark(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/**
 * One answer on the marking screen, and the controls that change what is
 * recorded for it.
 *
 * ## Nothing changes by accident
 *
 * The 2026-10-15 redesign made every option row of a choice question a click
 * target: one stray click swapped the student's recorded answer, rewrote the
 * mark box under it, and «حفظ» then wrote both — silently, and with an
 * unanswered question saved as "answered with nothing" on every save
 * (`{kind:'choice', optionIds: []}` went out whether or not anything changed).
 * The owner: «لو دوست بالغلط لازم يسألني… مايتغيّرش على طول». So:
 *
 *   · the options are READ-ONLY — the same rows the student's review shows,
 *     with the right option and the student's pick marked in words as well as
 *     colour — until «تعديل إجابة الطالب» is pressed on purpose;
 *   · `response` is sent ONLY when the edited selection differs from what is
 *     stored; the API checks it belongs to this question (`checkChoiceOverride`);
 *   · any save that would overwrite a stored answer or a stored mark first
 *     opens a confirmation listing old → new. Marking an essay nobody has
 *     marked yet does not ask — that is the screen's ordinary job, done thirty
 *     times an evening — and neither does a note on its own.
 *
 * ## The empty box is load-bearing
 *
 * `mark` arrives NULL for anything unmarked — never 0. «Unmarked» and «marked
 * zero» are different facts, and this screen exists to turn the first into the
 * second; a box that opened pre-filled with a zero nobody typed would let him
 * "confirm" a grade he never made, one Enter at a time. So an unmarked answer
 * renders an empty field, and Save stays disabled until something is in it.
 *
 * A blank ANSWER is the mirror image and is deliberately not auto-zeroed
 * either: `gradeQuestion` never scores an essay at all, so a blank one still
 * needs a human to write the nought.
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
  const editHintId = `${fieldId}-edit`;

  const type = question.type ?? '';
  const options = question.options ?? [];
  const isSingle = SINGLE.has(type);
  const isChoice = isSingle || type === MULTI;
  const isOrdering = type === 'ordering';

  // What is RECORDED right now. Moves forward after every successful save, so
  // a second edit is compared with the first edit's result, not the original.
  const [stored, setStored] = useState(() => ({
    mark: question.mark,
    chosen: question.chosenOptionIds ?? [],
    verdict: verdictFromState(question.correctness),
  }));
  const [mark, setMark] = useState(question.mark === null ? '' : formatMark(question.mark));
  const [feedback, setFeedback] = useState(question.feedbackHtml ?? '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(stored.chosen);
  const [suggested, setSuggested] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [pending, startTransition] = useTransition();
  const refreshPendingCount = useRefreshGradingPendingCount();

  const parsed = Number(mark);
  const canSave = mark.trim() !== '' && Number.isFinite(parsed);
  const nextMark = Math.min(Math.max(parsed, 0), question.maxMark);
  const outOf = formatCopy(c.markOutOf, { n: formatMark(question.maxMark) });

  const shownChosen = editing ? draft : stored.chosen;
  const responseChanged = editing && !sameIds(draft, stored.chosen);
  /*
   * A mark TYPED, as opposed to the stored one re-sent from an untouched box.
   * Both the raw and the clamped value have to differ: «-1» left alone under
   * an engine's negative mark is not a 0, and a 20 typed into a 5-mark box
   * that already holds 5 changes nothing.
   */
  const markEdited =
    canSave &&
    (stored.mark === null || (!sameShownMark(parsed, stored.mark) && !sameShownMark(nextMark, stored.mark)));
  // ...over a mark that is recorded — the half that asks first.
  const markChanged = markEdited && stored.mark !== null;
  // Every option unticked. Not an answer the API takes (`optionIds` is
  // `.min(1)`): a blank answer is NO response, which only «إلغاء التعديل»
  // puts back — so the card says so instead of letting a save fail.
  const emptyEdit = editing && draft.length === 0;
  const needsConfirm = responseChanged || markChanged;

  // The weights the engine grades with. An API older than this card sends
  // none, and then right is everything and wrong nothing.
  const weights = options.map((option) => ({
    id: option.id,
    fraction: option.fraction ?? (option.isRight ? 1 : 0),
  }));

  function pick(ids: string[]) {
    setDraft(ids);
    // The mark the new answer is worth — by the engine's own formula
    // (`gradeChoice`), so a single answer with two weighted options suggests
    // the weight of the one picked, not «all of the right ones or nothing».
    // Floored at 0 like every mark typed here. Suggested and SAID: the box
    // changing on its own is the kind of silent edit this card stopped making.
    const graded = isChoice ? gradeChoice(type as ChoiceType, weights, ids) : null;
    const fraction = graded === null ? 0 : Math.min(Math.max(graded.fraction, 0), 1);
    setMark(formatMark(Math.round(fraction * question.maxMark * 10_000) / 10_000));
    setSuggested(true);
    setStatus('idle');
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(stored.chosen);
    if (suggested) setMark(stored.mark === null ? '' : formatMark(stored.mark));
    setSuggested(false);
  }

  function requestSave() {
    if (!canSave || pending || emptyEdit) return;
    if (needsConfirm) setConfirmOpen(true);
    else save();
  }

  function save() {
    setStatus('idle');
    startTransition(async () => {
      const trimmed = feedback.trim();
      const result = await gradeAnswerAction(attemptId, question.attemptQuestionId, {
        // The stored mark itself when the box was not touched — the API then
        // sees no change and leaves the engine's attribution alone.
        mark: markEdited ? Math.max(parsed, 0) : (stored.mark ?? Math.max(parsed, 0)),
        feedbackHtml: trimmed === '' ? undefined : trimmed,
        // ONLY when he actually changed it. Sending it on every save is what
        // turned a skipped question into an "answered with nothing" one.
        ...(responseChanged ? { response: { kind: 'choice' as const, optionIds: draft } } : {}),
      });

      setConfirmOpen(false);
      if (!result.ok) {
        setStatus('failed');
        return;
      }

      const savedMark = markEdited ? Math.round(nextMark * 10_000) / 10_000 : (stored.mark ?? nextMark);
      setStored({
        mark: savedMark,
        chosen: responseChanged ? draft : stored.chosen,
        verdict: verdictFor(savedMark, question.maxMark),
      });
      setMark(formatMark(savedMark));
      setEditing(false);
      setSuggested(false);
      setStatus('saved');
      onGraded(result.scaledScore);
      refreshPendingCount();
    });
  }

  /** «ب»، «أ، ج» — the letters the student saw, which is what he is looking at. */
  function lettersOf(ids: readonly string[]): string {
    const letters = options.flatMap((option, index) => (ids.includes(option.id) ? [optionLetter(index, question.questionHtml)] : []));
    return letters.length === 0 ? g.confirmNone : letters.join(copy.quiz.answerListSeparator);
  }

  function markOf(value: number | null): string {
    return value === null
      ? g.confirmUnmarked
      : formatCopy(g.confirmMarkValue, { mark: formatMark(value), max: formatMark(question.maxMark) });
  }

  return (
    <article
      className={cn(
        'review-card',
        stored.verdict === 'correct' && 'review-card--correct',
        stored.verdict === 'incorrect' && 'review-card--incorrect',
      )}
    >
      <div className="qhead">
        <span className="qhead__num">{formatCopy(copy.quiz.questionNumber, { n: question.slotPosition + 1 })}</span>
        {type in copy.quiz.kinds ? (
          <span className="qhead__chip">{copy.quiz.kinds[type as keyof typeof copy.quiz.kinds]}</span>
        ) : null}
        <span className="qhead__chip qhead__chip--mark">{arabicCount(question.maxMark, quizExperience.counts.marks)}</span>
        <span
          className={cn(
            'review-verdict qhead__flag',
            stored.verdict === 'correct' && 'review-verdict--correct',
            stored.verdict === 'incorrect' && 'review-verdict--incorrect',
          )}
        >
          {stored.verdict === 'correct' ? <Check className="size-3.5" aria-hidden="true" /> : null}
          {stored.verdict === 'incorrect' ? <X className="size-3.5" aria-hidden="true" /> : null}
          {g.correctness[stored.verdict]}
        </span>
      </div>

      <SafeHtml html={question.questionHtml} className="qcard__stem" />

      {isChoice ? (
        <div className="flex flex-col gap-3">
          {stored.chosen.length === 0 && !editing ? (
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{g.unanswered}</p>
          ) : null}

          {editing ? (
            <p id={editHintId} className="grade-edit">
              <Pencil className="size-4 shrink-0" aria-hidden="true" />
              {g.editHint}
            </p>
          ) : null}

          {editing && isSingle ? (
            <RadioGroup
              value={draft[0] ?? ''}
              onValueChange={(value) => pick([value])}
              aria-describedby={editHintId}
              aria-label={g.editAnswer}
            >
              <ul className="runner-options flex flex-col gap-2">
                {options.map((option, index) => (
                  <li key={option.id}>
                    <label className="runner-option">
                      <span className="runner-option__letter">{optionLetter(index, question.questionHtml)}</span>
                      <OptionBody option={option} chosen={false} />
                      <RadioGroupItem value={option.id} className="runner-option__control" />
                    </label>
                  </li>
                ))}
              </ul>
            </RadioGroup>
          ) : editing ? (
            <ul className="runner-options flex flex-col gap-2" aria-describedby={editHintId}>
              {options.map((option, index) => (
                <li key={option.id}>
                  <label className="runner-option">
                    <span className="runner-option__letter">{optionLetter(index, question.questionHtml)}</span>
                    <OptionBody option={option} chosen={false} />
                    <Checkbox
                      className="runner-option__control"
                      checked={draft.includes(option.id)}
                      onCheckedChange={(next) =>
                        pick(next ? [...draft, option.id] : draft.filter((id) => id !== option.id))
                      }
                    />
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            // Read-only: the student's review rows, letters and all, so «ب»
            // here is the «ب» the student chose and sees marked.
            <ul className="runner-options flex flex-col gap-2" aria-label={g.optionsTitle}>
              {options.map((option, index) => {
                const chosen = shownChosen.includes(option.id);
                const right = Boolean(option.isRight);
                return (
                  <li key={option.id}>
                    <div
                      className={cn(
                        'runner-option review-option',
                        right ? 'review-option--right' : chosen ? 'review-option--wrong' : null,
                      )}
                    >
                      <span className="runner-option__letter">{optionLetter(index, question.questionHtml)}</span>
                      <OptionBody option={option} chosen={chosen} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Mounted with the edit, empty, so only its content comes and goes
              — a live region inserted together with its text is not reliably
              announced. While empty it takes back the column's gap. */}
          {editing ? (
            <div role="status" className="empty:-mt-3">
              {emptyEdit ? (
                <p className="grade-edit grade-edit--empty">
                  <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                  {g.editNeedsChoice}
                </p>
              ) : null}
            </div>
          ) : null}

          {suggested && !emptyEdit ? (
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{g.markSuggested}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {editing ? (
              <Button type="button" variant="secondary" size="sm" onClick={cancelEdit} disabled={pending}>
                <X className="size-4" aria-hidden="true" />
                {g.cancelEdit}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDraft(stored.chosen);
                  setEditing(true);
                  setStatus('idle');
                }}
              >
                <Pencil className="size-4" aria-hidden="true" />
                {g.editAnswer}
              </Button>
            )}
          </div>
        </div>
      ) : isOrdering ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <OrderColumn label={g.studentOrder} ids={stored.chosen} options={options} empty={g.unanswered} />
          <OrderColumn
            label={g.rightOrder}
            ids={[...options].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((option) => option.id)}
            options={options}
          />
        </div>
      ) : (
        <div className="review-answers">
          <div className="review-answer">
            <p className="review-answer__label">{c.studentAnswer}</p>
            {question.responseText === null || question.responseText.trim() === '' ? (
              <p className="review-answer__text text-fg-faint">{c.noAnswer}</p>
            ) : (
              <p className="review-answer__text text-[length:var(--fs-text-base)]">{question.responseText}</p>
            )}
          </div>
          {type === 'short_answer' && question.rightAnswerText ? (
            <div className="review-answer review-answer--right">
              <p className="review-answer__label">{g.rightOption}</p>
              <p className="review-answer__text">{question.rightAnswerText}</p>
            </div>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
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
              setSuggested(false);
              setStatus('idle');
            }}
            className="tabular-nums"
          />
        </div>
        <p className="pb-2.5 text-[length:var(--fs-text-sm)] text-fg-muted tabular-nums">{outOf}</p>

        <div className="flex flex-wrap items-center gap-1.5 pb-1">
          {[
            { label: formatCopy(g.quickFull, { n: formatMark(question.maxMark) }), value: question.maxMark },
            ...(question.maxMark > 1
              ? [{ label: formatCopy(g.quickHalf, { n: formatMark(question.maxMark / 2) }), value: question.maxMark / 2 }]
              : []),
            { label: g.quickZero, value: 0 },
          ].map((quick) => (
            <Button
              key={quick.label}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setMark(formatMark(quick.value));
                setSuggested(false);
                setStatus('idle');
              }}
            >
              {quick.label}
            </Button>
          ))}
        </div>
      </div>

      <div>
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
          placeholder={g.feedbackPlaceholder}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={requestSave} disabled={pending || !canSave || emptyEdit} aria-busy={pending}>
          {pending ? g.saving : g.save}
        </Button>

        {status === 'saved' ? (
          <p className="inline-flex items-center gap-1.5 text-[length:var(--fs-text-sm)] font-medium text-ok">
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

      {/*
        «نحفظ التعديل ده؟» — old → new for every recorded value this save
        overwrites. «رجوع» is focused: a stray Enter must cost nothing.
      */}
      <Dialog open={confirmOpen} onOpenChange={(open) => !pending && setConfirmOpen(open)}>
        <DialogContent closeLabel={copy.common.close}>
          <DialogHeader>
            <DialogTitle>{g.confirmTitle}</DialogTitle>
            <DialogDescription>{g.confirmBody}</DialogDescription>
          </DialogHeader>
          <dl className="grade-confirm">
            {responseChanged ? (
              <ChangeRow label={g.confirmAnswer} from={lettersOf(stored.chosen)} to={lettersOf(draft)} />
            ) : null}
            {/* The mark is listed whenever the dialog opens — an answer
                swapped for another is a question about the mark too — but
                only struck through when it actually moves. */}
            {!canSave ? null : markEdited ? (
              <ChangeRow label={g.confirmMark} from={markOf(stored.mark)} to={markOf(nextMark)} />
            ) : (
              <SameRow label={g.confirmMark} value={markOf(stored.mark)} />
            )}
          </dl>
          <DialogFooter>
            <Button type="button" variant="secondary" autoFocus onClick={() => setConfirmOpen(false)} disabled={pending}>
              {g.confirmCancel}
            </Button>
            <Button type="button" onClick={save} disabled={pending} aria-busy={pending}>
              {pending ? g.saving : g.confirmAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

/** An option's text, with what it IS said in words beside the colour. */
function OptionBody({
  option,
  chosen,
}: {
  option: NonNullable<GradingQuestion['options']>[number];
  chosen: boolean;
}) {
  return (
    <div className="review-option__main">
      <SafeHtml html={option.bodyHtml} className="runner-option__body" />
      {option.isRight || chosen ? (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] font-medium">
          {option.isRight ? (
            <span className="inline-flex items-center gap-1 text-ok">
              <Check className="size-3.5" aria-hidden="true" />
              {g.rightOption}
            </span>
          ) : null}
          {chosen ? (
            <span className={cn('inline-flex items-center gap-1', option.isRight ? 'text-fg-muted' : 'text-err')}>
              {option.isRight ? null : <X className="size-3.5" aria-hidden="true" />}
              {g.studentChoice}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

function OrderColumn({
  label,
  ids,
  options,
  empty,
}: {
  label: string;
  ids: readonly string[];
  options: NonNullable<GradingQuestion['options']>;
  empty?: string;
}) {
  const byId = new Map(options.map((option) => [option.id, option]));
  const rows = ids.flatMap((id) => {
    const option = byId.get(id);
    return option ? [option] : [];
  });
  return (
    <div className="review-answer">
      <p className="review-answer__label">{label}</p>
      {rows.length === 0 ? (
        <p className="review-answer__text text-fg-faint">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.map((option, index) => (
            <li key={option.id} className="flex items-start gap-2">
              <span className="mono shrink-0 text-[length:var(--fs-mono-label)] tabular-nums text-fg-muted">
                {index + 1}
              </span>
              <SafeHtml html={option.bodyHtml} className="min-w-0 text-[length:var(--fs-text-sm)]" />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** A value the save leaves as it is — said in words, nothing struck through. */
function SameRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grade-confirm__row">
      <dt className="grade-confirm__label">{label}</dt>
      <dd className="grade-confirm__change grade-confirm__same">{formatCopy(g.confirmSame, { value })}</dd>
    </div>
  );
}

/** One «old → new» line of the confirmation. */
function ChangeRow({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <div className="grade-confirm__row">
      <dt className="grade-confirm__label">{label}</dt>
      <dd className="grade-confirm__change">
        <span className="sr-only">{formatCopy(g.confirmChange, { from, to })}</span>
        <span aria-hidden="true" className="grade-confirm__from">
          {from}
        </span>
        <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
        <span aria-hidden="true" className="grade-confirm__to">
          {to}
        </span>
      </dd>
    </div>
  );
}
