'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { dailyEssayCopy } from '@ayman/contracts/copy/daily-essay';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Textarea } from '@ayman/ui/components/textarea';
import { cn } from '@ayman/ui/lib/cn';
import { markEssayAction } from '../actions';

const c = dailyEssayCopy.admin.marking;

/** Up to this total the mark is a row of buttons; above it, a number field alone. */
const BUTTONS_UP_TO = 20;

/**
 * The mark, and the note that goes with it.
 *
 * ## The mark is a row of buttons
 *
 * A question is out of ten or so, and the marker does two hundred of these: a
 * tap on «٧» beats focusing a field and typing it. The field is still there
 * for a half mark, and it is all there is for a total too big to lay out.
 *
 * ## «حفظ والتالي» is the primary button
 *
 * The job is the pile, not the page: saving moves straight to the next answer
 * waiting — the same question's first, so one model answer stays in the
 * marker's head — and only the last one returns to the queue.
 *
 * ## The note is optional
 *
 * The student sees the model answer beside the mark, which already says most
 * of what a note would. The canned ones are one tap for when it does not.
 */
export function EssayMarkForm({
  id,
  maxMarks,
  initialMark,
  initialNote,
  nextPendingId,
  hasImages,
}: {
  id: string;
  maxMarks: number;
  initialMark: number | null;
  initialNote: string | null;
  nextPendingId: string | null;
  /** Whether saving will delete photographs — the warning is only true then. */
  hasImages: boolean;
}) {
  const router = useRouter();
  const [mark, setMark] = useState(initialMark === null ? '' : String(initialMark));
  const [note, setNote] = useState(initialNote ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const value = mark.trim() === '' ? null : Number(mark);
  // `''` is «not marked yet», never zero — `Number('')` is 0, which would
  // silently give a good answer nought.
  const valid = value !== null && Number.isFinite(value) && value >= 0 && value <= maxMarks && (value * 2) % 1 === 0;

  function save(goNext: boolean) {
    if (!valid || value === null) return;
    setError(null);
    startTransition(async () => {
      const result = await markEssayAction(id, { mark: value, note: note.trim() === '' ? null : note.trim() });
      if (!result.ok) {
        setError(c.failed);
        return;
      }
      router.push(goNext && nextPendingId ? `/admin/essays/${nextPendingId}` : '/admin/essays?tab=marking');
    });
  }

  return (
    <section className="mt-4 rounded-xl border border-accent/40 bg-surface-2 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label htmlFor="essay-mark">{c.mark}</Label>
        <span className="text-[length:var(--fs-text-sm)] text-fg-muted tabular-nums">
          {formatCopy(c.outOf, { max: maxMarks })}
        </span>
      </div>

      {maxMarks <= BUTTONS_UP_TO ? (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={c.mark}>
          {Array.from({ length: maxMarks + 1 }, (_, n) => n).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={value === n}
              onClick={() => setMark(String(n))}
              className={cn(
                'grid size-11 place-items-center rounded-lg border font-mono text-[length:var(--fs-text-base)] font-bold tabular-nums',
                'transition-colors duration-[160ms] ease-out',
                value === n
                  ? 'border-accent bg-accent text-[#1A1206]'
                  : 'border-line bg-surface-3 text-fg hover:border-accent/50',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 max-w-[10rem]">
        <Input
          id="essay-mark"
          type="number"
          inputMode="decimal"
          min={0}
          max={maxMarks}
          step={0.5}
          value={mark}
          onChange={(event) => setMark(event.target.value)}
        />
      </div>

      <div className="mt-4">
        <p className="text-[length:var(--fs-text-sm)] font-semibold text-fg">{c.suggestions}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {dailyEssayCopy.admin.notes.map((line) => (
            <button
              key={line}
              type="button"
              onClick={() => setNote(line)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-start text-[length:var(--fs-text-sm)]',
                'transition-colors duration-[160ms] ease-out',
                note === line
                  ? 'border-accent bg-accent/10 text-fg'
                  : 'border-line bg-surface-3 text-fg-muted hover:border-accent/40 hover:text-fg',
              )}
            >
              {line}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <Label htmlFor="essay-note">{c.note}</Label>
        <Textarea
          id="essay-note"
          rows={3}
          maxLength={1000}
          dir="auto"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {nextPendingId ? (
          <Button type="button" onClick={() => save(true)} disabled={pending || !valid}>
            {pending ? c.saving : c.saveNext}
          </Button>
        ) : null}
        <Button
          type="button"
          variant={nextPendingId ? 'secondary' : 'primary'}
          onClick={() => save(false)}
          disabled={pending || !valid}
        >
          {pending && !nextPendingId ? c.saving : c.save}
        </Button>
      </div>
      {hasImages ? <p className="mt-2 text-[length:var(--fs-text-xs)] text-fg-muted">{c.warning}</p> : null}

      {error ? (
        <p role="alert" className="mt-2 text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
