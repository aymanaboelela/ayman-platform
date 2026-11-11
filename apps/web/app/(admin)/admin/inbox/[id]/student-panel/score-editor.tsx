'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import { adminStudentPanel as c } from '@ayman/contracts/copy/admin-student-panel';
import { formatCopy, formatMark } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { apiPatch } from '@/lib/api';

export interface EditableSitting {
  id: string;
  attemptNumber: number;
  score: number | null;
  gradeOutOf: number;
}

/**
 * «أغيّر درجة امتحان» — overwrite a handed-in sitting's mark.
 *
 * `PATCH /api/admin/attempts/:id/score`, the marking screen's own override
 * (`attempt:grade`): it recomputes the verdict against the sitting's pass
 * mark and writes the audit row. The API refuses an open sitting and a mark
 * above the scale; the form refuses the second too, before the round trip,
 * because «٢٥ من ٢٠» is a typo far more often than an intent.
 *
 * Folded behind a `<details>`: a number box sitting open on every card is the
 * place a stray keystroke changes a student's grade.
 */
export function ScoreEditor({ sittings }: { sittings: readonly EditableSitting[] }) {
  const router = useRouter();
  const [attemptId, setAttemptId] = useState(sittings[0]?.id ?? '');
  const sitting = sittings.find((row) => row.id === attemptId) ?? sittings[0];
  const [value, setValue] = useState(sitting?.score === null || !sitting ? '' : String(sitting.score));
  const [pending, setPending] = useState(false);

  if (!sitting) return null;

  function pick(id: string) {
    setAttemptId(id);
    const next = sittings.find((row) => row.id === id);
    setValue(next?.score === null || !next ? '' : String(next.score));
  }

  async function save() {
    if (!sitting) return;
    const scaledScore = Number(value);
    if (value.trim() === '' || !Number.isFinite(scaledScore) || scaledScore < 0 || scaledScore > sitting.gradeOutOf) {
      toast.error(formatCopy(c.exams.scoreTooHigh, { outOf: formatMark(sitting.gradeOutOf) }));
      return;
    }
    setPending(true);
    try {
      await apiPatch(`/api/admin/attempts/${encodeURIComponent(sitting.id)}/score`, { scaledScore });
      toast.success(c.exams.scoreSaved);
      router.refresh();
    } catch {
      toast.error(c.exams.failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="group min-w-0 open:basis-full">
      <summary
        className={cn(
          'inline-flex min-h-9 cursor-pointer select-none list-none items-center gap-1.5 rounded-lg border border-line px-3',
          'text-[length:var(--fs-text-sm)] font-medium text-fg transition-colors duration-[160ms] ease-out hover:border-accent/50',
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <PencilLine className="size-4" aria-hidden="true" />
        {c.exams.editScore}
      </summary>
      <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface-1 p-3">
        {sittings.length > 1 ? (
          <label className="flex flex-col gap-1 text-[length:var(--fs-text-xs)] text-fg-muted">
            {c.exams.whichAttempt}
            <select
              value={sitting.id}
              onChange={(event) => pick(event.target.value)}
              className="min-h-9 rounded-lg border border-line bg-surface-2 px-2 text-[length:var(--fs-text-sm)] text-fg"
            >
              {sittings.map((row) => (
                <option key={row.id} value={row.id}>
                  {formatCopy(c.exams.attemptOption, {
                    n: row.attemptNumber,
                    mark: row.score === null ? '—' : `${formatMark(row.score)}/${formatMark(row.gradeOutOf)}`,
                  })}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-[length:var(--fs-text-xs)] text-fg-muted">
          {formatCopy(c.exams.scoreLabel, { outOf: formatMark(sitting.gradeOutOf) })}
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={sitting.gradeOutOf}
            step="any"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save();
            }}
            className="mono min-h-9 w-28 rounded-lg border border-line bg-surface-2 px-2 text-[length:var(--fs-text-sm)] text-fg [direction:ltr]"
          />
        </label>
        <button
          type="button"
          onClick={() => void save()}
          disabled={pending}
          className="min-h-9 rounded-lg bg-accent px-4 text-[length:var(--fs-text-sm)] font-semibold text-[color:var(--on-accent-ink)] transition-opacity duration-[160ms] ease-out hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? c.exams.saving : c.exams.save}
        </button>
      </div>
    </details>
  );
}
