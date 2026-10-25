'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ListChecks, PenLine, X } from 'lucide-react';
// `/copy/admin`, never the root barrel — this only renders inside /admin.
import { copy } from '@ayman/contracts/copy/admin';
import { adminGrading } from '@ayman/contracts/copy/admin-grading';
import type { AdminGradingAttempt } from '@ayman/contracts/admin/exams';
import { formatCopy, formatMark } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
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
import { overrideScoreAction } from '@/app/(admin)/admin/grading/actions';
import { GradeAnswerCard } from './grade-answer-card';
import { isWrongVerdict, verdictFromState } from './verdict';

const c = copy.admin.grading;
const g = adminGrading;

type Filter = 'all' | 'pending' | 'wrong' | 'correct';

export interface GradingPaperProps {
  attempt: AdminGradingAttempt;
  /**
   * Formatted on the SERVER and handed over as a string, never as a `Date` this
   * component formats itself. `Intl` inside a client component runs once in the
   * Node timezone during SSR and again in the browser's on hydration, and the
   * two disagree for every admin who is not sitting on the server's clock —
   * React reports that as a hydration mismatch and swaps the text after paint.
   * Null when the attempt carries no submission stamp.
   */
  submittedAtLabel: string | null;
  /** Rendered under the header — the page's «متابعة الامتحان» panel, a
   *  Server Component handed in already rendered. */
  aside?: React.ReactNode;
}

/**
 * One paper: who wrote it, what it is worth right now, and every answer on it.
 *
 * ## Why the total lives HERE and not in the page
 *
 * Marking any one answer moves the paper's whole score — `grade` and
 * `recomputeScoreTx` run in one transaction, precisely so a marked question can
 * never sit above a stale total. Seeing that number move is the only
 * confirmation the instructor gets that the write landed, and it is the point
 * of the feature: the score was silently wrong for every essay ever answered.
 *
 * So `scaledScore` is state, seeded from the server's value and replaced by
 * whatever the PATCH returns. Every card reports up to the same setter; nothing
 * recomputes anything locally, because the API is the only thing that knows how
 * the paper rescales (it reads the attempt's OWN `gradeOutOf`/`sumMarks`
 * snapshots, not the quiz's live settings).
 *
 * `aria-live="polite"` on that line, and the element is present from the first
 * render rather than mounted on the first save — a live region that appears
 * with its content is never announced.
 *
 * ## «تعديل المجموع»
 *
 * Setting the total by hand overwrites a number the student has been shown,
 * so it asks first, old → new, and says the one thing that is easy to miss:
 * the next per-question mark recomputes the total from the questions.
 *
 * ## The filter
 *
 * The student review's own segmented control (`.review-filter`), over the
 * verdicts `verdict.ts` reads off the raw row states — the buckets the
 * redesign built compared against values the API never sends, so «الغلط» and
 * «الصح» were always empty.
 */
export function GradingPaper({ attempt, submittedAtLabel, aside }: GradingPaperProps) {
  const fieldId = useId();
  const [total, setTotal] = useState<number | null>(attempt.scaledScore);
  const [editingTotal, setEditingTotal] = useState(false);
  const [totalInput, setTotalInput] = useState('');
  const [totalError, setTotalError] = useState<string | null>(null);
  const [totalSaved, setTotalSaved] = useState(false);
  const [confirmTotal, setConfirmTotal] = useState<number | null>(null);
  const [totalPending, startTotalTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>('all');

  const verdicts = attempt.questions.map((question) => verdictFromState(question.correctness));
  const buckets: Record<Filter, typeof attempt.questions> = {
    all: attempt.questions,
    pending: attempt.questions.filter((question, index) => verdicts[index] === 'needs_grading' || question.mark === null),
    wrong: attempt.questions.filter((_, index) => isWrongVerdict(verdicts[index]!)),
    correct: attempt.questions.filter((_, index) => verdicts[index] === 'correct'),
  };
  const shown = buckets[filter];

  const outOf = attempt.gradeOutOf;

  function startEditingTotal() {
    setTotalInput(total === null ? '' : formatMark(total));
    setTotalError(null);
    setTotalSaved(false);
    setEditingTotal(true);
  }

  function requestTotal() {
    const parsed = Number(totalInput);
    if (totalInput.trim() === '' || !Number.isFinite(parsed) || parsed < 0 || parsed > outOf) {
      setTotalError(formatCopy(g.overrideInvalid, { outOf: formatMark(outOf) }));
      return;
    }
    setTotalError(null);
    setConfirmTotal(parsed);
  }

  function saveTotal(value: number) {
    startTotalTransition(async () => {
      const result = await overrideScoreAction(attempt.attemptId, value);
      setConfirmTotal(null);
      if (!result.ok) {
        setTotalError(g.overrideFailed);
        return;
      }
      setTotal(result.scaledScore);
      setEditingTotal(false);
      setTotalSaved(true);
    });
  }

  const filters: Array<{ key: Filter; label: string; icon: React.ReactNode }> = [
    { key: 'all', label: g.filterAll, icon: <ListChecks className="size-4" aria-hidden="true" /> },
    { key: 'pending', label: g.filterPending, icon: <PenLine className="size-4" aria-hidden="true" /> },
    { key: 'wrong', label: g.filterWrong, icon: <X className="size-4" aria-hidden="true" /> },
    { key: 'correct', label: g.filterCorrect, icon: <Check className="size-4" aria-hidden="true" /> },
  ];

  return (
    <>
      <header className="rounded-[var(--r-lg)] border border-line bg-surface-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[length:var(--fs-title-3)] font-semibold text-fg">
              <Link
                href={`/admin/students/${attempt.studentUserId}`}
                title={c.openProfile}
                className="underline-offset-4 hover:underline"
              >
                {attempt.studentName}
              </Link>
            </h1>
            <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg">{attempt.quizTitle}</p>
            {submittedAtLabel ? (
              <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted tabular-nums">{submittedAtLabel}</p>
            ) : null}
          </div>

          <div className="flex flex-col items-end gap-2">
            <p
              aria-live="polite"
              className="inline-flex rounded-[var(--r-md)] border border-[color-mix(in_oklch,var(--a-9),transparent_70%)] bg-accent/10 px-3 py-1.5 text-[length:var(--fs-text-sm)] font-semibold text-accent-text tabular-nums"
            >
              {total === null
                ? '—'
                : formatCopy(c.totalNow, { score: formatMark(total), outOf: formatMark(outOf) })}
            </p>
            {totalSaved ? (
              <p className="inline-flex items-center gap-1 text-[length:var(--fs-text-xs)] text-ok">
                <Check className="size-3.5" aria-hidden="true" />
                {g.overrideSaved}
              </p>
            ) : null}

            {!editingTotal ? (
              <Button type="button" variant="ghost" size="sm" onClick={startEditingTotal}>
                <PenLine className="size-4" aria-hidden="true" />
                {g.overrideOpen}
              </Button>
            ) : (
              <form
                className="flex flex-wrap items-end gap-2 rounded-[var(--r-md)] border border-line bg-surface-1 p-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  requestTotal();
                }}
              >
                <div className="w-24">
                  <Label htmlFor={`${fieldId}-total`} className="text-[length:var(--fs-text-xs)]">
                    {g.overrideLabel}
                  </Label>
                  <Input
                    id={`${fieldId}-total`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={totalInput}
                    onChange={(event) => setTotalInput(event.target.value)}
                    className="tabular-nums"
                    aria-invalid={totalError ? true : undefined}
                    aria-describedby={totalError ? `${fieldId}-total-error` : undefined}
                  />
                </div>
                <span className="pb-2.5 text-[length:var(--fs-text-sm)] text-fg-muted tabular-nums">
                  {formatCopy(g.overrideOutOf, { n: formatMark(outOf) })}
                </span>
                <Button type="submit" size="sm" disabled={totalPending}>
                  {g.overrideSave}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditingTotal(false)}>
                  {g.overrideCancel}
                </Button>
                {totalError ? (
                  <p id={`${fieldId}-total-error`} role="alert" className="basis-full text-[length:var(--fs-text-xs)] text-[color:var(--err)]">
                    {totalError}
                  </p>
                ) : null}
              </form>
            )}
          </div>
        </div>
      </header>

      {aside}

      {attempt.questions.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="review-filter flex-wrap" role="group" aria-label={g.filterLabel}>
            {filters
              .filter((item) => item.key === 'all' || buckets[item.key].length > 0)
              .map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="review-filter__option"
                  aria-pressed={filter === item.key}
                  onClick={() => setFilter(item.key)}
                >
                  {item.icon}
                  {formatCopy(item.label, { n: buckets[item.key].length })}
                </button>
              ))}
          </div>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <div className="empty mt-4">
          <p className="empty__title">{g.filterEmpty}</p>
        </div>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {shown.map((question) => (
            <li key={question.attemptQuestionId}>
              <GradeAnswerCard attemptId={attempt.attemptId} question={question} onGraded={setTotal} />
            </li>
          ))}
        </ol>
      )}

      <Dialog open={confirmTotal !== null} onOpenChange={(open) => !open && !totalPending && setConfirmTotal(null)}>
        <DialogContent closeLabel={copy.common.close}>
          <DialogHeader>
            <DialogTitle>{g.overrideConfirmTitle}</DialogTitle>
            <DialogDescription>
              {formatCopy(g.overrideConfirmBody, {
                from: total === null ? '—' : formatMark(total),
                to: confirmTotal === null ? '—' : formatMark(confirmTotal),
                outOf: formatMark(outOf),
              })}
            </DialogDescription>
          </DialogHeader>
          <p className="grade-confirm__change justify-center py-2 text-[length:var(--fs-title-4)]" aria-hidden="true">
            <span className="grade-confirm__from">{total === null ? '—' : formatMark(total)}</span>
            <ArrowLeft className="size-5 shrink-0" />
            <span className="grade-confirm__to">{confirmTotal === null ? '—' : formatMark(confirmTotal)}</span>
          </p>
          <DialogFooter>
            <Button type="button" variant="secondary" autoFocus onClick={() => setConfirmTotal(null)} disabled={totalPending}>
              {g.confirmCancel}
            </Button>
            <Button
              type="button"
              onClick={() => confirmTotal !== null && saveTotal(confirmTotal)}
              disabled={totalPending}
              aria-busy={totalPending}
            >
              {totalPending ? g.saving : g.confirmAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
