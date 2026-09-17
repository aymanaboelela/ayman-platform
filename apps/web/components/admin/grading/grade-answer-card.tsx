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
import { SafeHtml } from '@/components/content/safe-html';
import { gradeAnswerAction } from '@/app/(admin)/admin/grading/actions';

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

  /*
   * Strings, not numbers. A numeric state would have to represent "the box is
   * empty" as something, and every candidate (0, NaN) is either the wrong grade
   * or an unrenderable value. The string is what the field holds; the number is
   * derived at the moment of sending.
   */
  const [mark, setMark] = useState(question.mark === null ? '' : formatMark(question.mark));
  /*
   * Pre-filled from what is stored so a note can be REVISED rather than
   * silently replaced. The stored value has been through `sanitizeRichText`,
   * which leaves plain prose exactly as typed — this box is a textarea, not an
   * editor, and what he sees here is what the student is reading.
   */
  const [feedback, setFeedback] = useState(question.feedbackHtml ?? '');
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [pending, startTransition] = useTransition();

  const parsed = Number(mark);
  /*
   * `Number('')` is 0 — the exact trap that would have marked an untouched
   * answer as a zero — so emptiness is checked BEFORE the coercion is trusted.
   */
  const canSave = mark.trim() !== '' && Number.isFinite(parsed);

  const outOf = formatCopy(c.markOutOf, { n: formatMark(question.maxMark) });

  function save() {
    if (!canSave) return;
    setStatus('idle');

    startTransition(async () => {
      const trimmed = feedback.trim();
      const result = await gradeAnswerAction(attemptId, question.attemptQuestionId, {
        // Floored at zero on the way out: the contract refuses a negative
        // (`z.number().min(0)`), and a Zod throw would surface as «مقدرناش
        // نحفظ» — a transport-shaped message for a typed minus sign. The
        // server's own clamp does the same thing at the other end.
        mark: Math.max(parsed, 0),
        // `undefined`, not `''`: an empty string is a note that says nothing,
        // and sending one would overwrite a note he wrote earlier with silence.
        feedbackHtml: trimmed === '' ? undefined : trimmed,
      });

      if (!result.ok) {
        setStatus('failed');
        return;
      }

      // The server's clamp, mirrored onto the box for DISPLAY only — the stored
      // value is whatever `roundMark` wrote, and `formatMark` is the platform's
      // one way of rendering a mark (a paper worth 3 scaled to 100 arrives as
      // `66.6667`, and nobody's exam is out of 66.6667).
      setMark(formatMark(Math.min(Math.max(parsed, 0), question.maxMark)));
      setStatus('saved');
      onGraded(result.scaledScore);
    });
  }

  return (
    <article className="rounded-lg border border-line bg-surface-2 p-4 sm:p-5">
      <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
        {String(question.slotPosition + 1).padStart(2, '0')}
      </p>

      {/*
        Already sanitised by the API (`stemHtml` is written through
        `sanitizeRichText` in the question bank), and rendered the way the
        student review screen renders a stem. `SafeHtml` deliberately does NO
        sanitising of its own — the sanitiser is server-only and must not be
        reachable from a client bundle; see its header.
      */}
      <SafeHtml html={question.questionHtml} className="mt-2 text-fg" />

      <div className="mt-4 rounded-[var(--r-md)] border border-line-subtle bg-surface-3 p-3">
        <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.studentAnswer}</p>
        {question.responseText === null || question.responseText.trim() === '' ? (
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-faint">{c.noAnswer}</p>
        ) : (
          /*
            `whitespace-pre-wrap` — an essay is typed with its own line breaks
            and collapsing them turns three paragraphs into one. It is TEXT, not
            markup: `responseText` is what the student typed and is rendered as
            a text node, never through `SafeHtml`.
          */
          <p className="mt-1 whitespace-pre-wrap text-[length:var(--fs-text-base)] leading-relaxed text-fg [overflow-wrap:anywhere]">
            {question.responseText}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-2">
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
              // «اتحفظت» beside a number he has since changed is a lie about
              // the current contents of the box.
              setStatus('idle');
            }}
            className="tabular-nums"
          />
        </div>
        {/* The ceiling as a sentence, not as an attribute — see the header. */}
        <p className="pb-2.5 text-[length:var(--fs-text-sm)] text-fg-muted tabular-nums">{outOf}</p>
      </div>

      <div className="mt-3">
        <Label htmlFor={feedbackId}>{c.feedbackLabel}</Label>
        <Textarea
          id={feedbackId}
          rows={3}
          maxLength={FEEDBACK_MAX}
          value={feedback}
          onChange={(event) => {
            setFeedback(event.target.value);
            setStatus('idle');
          }}
          className="min-h-24"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={save} disabled={pending || !canSave}>
          {c.save}
        </Button>

        {status === 'saved' ? (
          <p className="inline-flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted">
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
