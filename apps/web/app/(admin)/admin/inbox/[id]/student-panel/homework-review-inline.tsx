'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PencilLine, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminHomeworkRow } from '@ayman/contracts/homework';
import { adminStudentPanel as c } from '@ayman/contracts/copy/admin-student-panel';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { reviewHomeworkAction } from '../../../homework/actions';
import { defaultHomeworkMessage } from './homework-message';

type Decision = 'accepted' | 'needs_work';

/**
 * «أغيّر درجة واجب» — the review queue's own decision, from the drawer.
 *
 * Same server action as `/admin/homework/[id]` (`homework:review`), so the
 * same contract parse, the same refusal of a mark on «يتعاد», and the same
 * message into the student's thread. That message is not optional — the API
 * always writes it — so the box starts filled with a line that matches the
 * choice, and keeps following the choice until he types in it himself.
 *
 * Once accepted, the photographs are gone and «يتعاد» would ask for work
 * nobody can look at again; only the mark and the note can change, which is
 * the one re-review the API is specified for (`homework.service.spec`:
 * «allows updating the grade and note on an already-accepted submission»).
 */
export function HomeworkReviewInline({ row }: { row: AdminHomeworkRow }) {
  const router = useRouter();
  const locked = row.status === 'accepted';
  const [decision, setDecision] = useState<Decision>(row.status === 'needs_work' ? 'needs_work' : 'accepted');
  const [grade, setGrade] = useState(row.grade === null ? '' : String(row.grade));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const gradeValue = grade.trim() === '' ? null : Number(grade);
  const shown =
    message ??
    defaultHomeworkMessage({ lesson: row.lessonTitle, decision, grade: decision === 'accepted' ? gradeValue : null });

  async function save() {
    if (gradeValue !== null && (!Number.isFinite(gradeValue) || gradeValue < 0 || gradeValue > 100)) {
      toast.error(formatCopy(c.exams.scoreTooHigh, { outOf: '100' }));
      return;
    }
    setPending(true);
    const result = await reviewHomeworkAction(row.id, {
      decision,
      grade: decision === 'accepted' ? gradeValue : null,
      message: shown,
    });
    setPending(false);
    if (result.ok) {
      toast.success(c.homework.saved);
      router.refresh();
    } else {
      toast.error(c.homework.failed);
    }
  }

  const choice = (value: Decision, label: string, tone: string) => (
    <button
      type="button"
      onClick={() => setDecision(value)}
      aria-pressed={decision === value}
      className={cn(
        'min-h-9 rounded-lg border px-3 text-[length:var(--fs-text-sm)] font-medium transition-colors duration-[160ms] ease-out',
        decision === value ? tone : 'border-line text-fg-muted hover:text-fg',
      )}
    >
      {label}
    </button>
  );

  return (
    <details className="min-w-0 open:basis-full">
      <summary
        className={cn(
          'inline-flex min-h-9 cursor-pointer select-none list-none items-center gap-1.5 rounded-lg border border-line px-3',
          'text-[length:var(--fs-text-sm)] font-medium text-fg transition-colors duration-[160ms] ease-out hover:border-accent/50',
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <PencilLine className="size-4" aria-hidden="true" />
        {c.homework.edit}
      </summary>
      <div className="mt-2 flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-3">
        {locked ? null : (
          <div className="flex flex-wrap gap-2">
            {choice(
              'accepted',
              c.homework.decisionAccepted,
              'border-[color:var(--ok)] bg-[color-mix(in_oklch,var(--ok),transparent_86%)] text-[color:var(--ok)]',
            )}
            {choice(
              'needs_work',
              c.homework.decisionNeedsWork,
              'border-[color:var(--warn)] bg-[color-mix(in_oklch,var(--warn),transparent_86%)] text-[color:var(--warn)]',
            )}
          </div>
        )}
        {decision === 'accepted' ? (
          <label className="flex flex-col gap-1 text-[length:var(--fs-text-xs)] text-fg-muted">
            {c.homework.gradeLabel}
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="any"
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              className="mono min-h-9 w-32 rounded-lg border border-line bg-surface-2 px-2 text-[length:var(--fs-text-sm)] text-fg [direction:ltr]"
            />
            <span className="text-fg-faint">{c.homework.gradeHint}</span>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-[length:var(--fs-text-xs)] text-fg-muted">
          {c.homework.messageLabel}
          <textarea
            value={shown}
            onChange={(event) => setMessage(event.target.value)}
            rows={2}
            maxLength={1000}
            className="rounded-lg border border-line bg-surface-2 p-2 text-[length:var(--fs-text-sm)] text-fg"
          />
        </label>
        {decision === 'accepted' && !locked && !row.imagesPurged ? (
          <p className="flex items-center gap-1.5 text-[length:var(--fs-text-xs)] text-[color:var(--warn)]">
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
            {c.homework.acceptWarning}
          </p>
        ) : null}
        <div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={pending || shown.trim().length < 2}
            className="min-h-9 rounded-lg bg-accent px-4 text-[length:var(--fs-text-sm)] font-semibold text-[color:var(--on-accent-ink)] transition-opacity duration-[160ms] ease-out hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? c.exams.saving : c.exams.save}
          </button>
        </div>
      </div>
    </details>
  );
}
