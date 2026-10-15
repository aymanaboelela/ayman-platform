'use client';

import { useState } from 'react';
import Link from 'next/link';
// `/copy/admin`, never the root barrel — this only renders inside /admin.
import { copy } from '@ayman/contracts/copy/admin';
import type { AdminGradingAttempt } from '@ayman/contracts/admin/exams';
import { formatCopy, formatMark } from '@ayman/contracts/format';
import { GradeAnswerCard } from './grade-answer-card';

const c = copy.admin.grading;

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
}

/**
 * One paper: who wrote it, what it is worth right now, and every answer that
 * needs a human.
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
 * ## What the questions list contains
 *
 * Not only the unmarked ones. `forAttempt` also returns anything a HUMAN has
 * already marked (`gradedBy` is null on everything the engine scored), so a
 * typo'd 3 can be corrected here instead of by a developer. Those arrive with
 * their mark pre-filled; the unmarked ones arrive empty.
 */
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Edit3, Check } from 'lucide-react';
import { overrideScoreAction } from '@/app/(admin)/admin/grading/actions';

export function GradingPaper({ attempt, submittedAtLabel }: GradingPaperProps) {
  const [total, setTotal] = useState<number | null>(attempt.scaledScore);
  const [editingScore, setEditingScore] = useState(false);
  const [overrideScoreInput, setOverrideScoreInput] = useState(
    attempt.scaledScore === null ? '' : String(attempt.scaledScore),
  );
  const [scoreOverridePending, setScoreOverridePending] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'wrong' | 'correct'>('all');

  const pendingQuestions = attempt.questions.filter(
    (q) => q.correctness === 'needs_grading' || q.mark === null,
  );
  const wrongQuestions = attempt.questions.filter(
    (q) => q.correctness === 'incorrect' || q.correctness === 'partial',
  );
  const correctQuestions = attempt.questions.filter((q) => q.correctness === 'correct');

  const filteredQuestions =
    filter === 'pending'
      ? pendingQuestions
      : filter === 'wrong'
        ? wrongQuestions
        : filter === 'correct'
          ? correctQuestions
          : attempt.questions;

  async function handleSaveScoreOverride() {
    const parsed = Number(overrideScoreInput);
    if (!Number.isFinite(parsed) || parsed < 0) return;

    setScoreOverridePending(true);
    try {
      const res = await overrideScoreAction(attempt.attemptId, parsed);
      if (res.ok) {
        setTotal(res.scaledScore);
        setEditingScore(false);
      }
    } finally {
      setScoreOverridePending(false);
    }
  }

  return (
    <>
      <header className="rounded-xl border border-line bg-surface-2 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
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
              <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted tabular-nums">
                {submittedAtLabel}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col items-end gap-2">
            <p
              aria-live="polite"
              className="inline-flex rounded-[var(--r-md)] border border-[color-mix(in_oklch,var(--a-9),transparent_70%)] bg-accent/10 px-3 py-1.5 text-[length:var(--fs-text-sm)] font-semibold text-accent-text tabular-nums"
            >
              {total === null
                ? '—'
                : formatCopy(c.totalNow, {
                    score: formatMark(total),
                    outOf: formatMark(attempt.gradeOutOf),
                  })}
            </p>

            {!editingScore ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOverrideScoreInput(total === null ? '' : String(total));
                  setEditingScore(true);
                }}
                className="gap-1.5 text-[length:var(--fs-text-xs)] text-fg-muted hover:text-fg"
              >
                <Edit3 className="size-3.5" aria-hidden="true" />
                تعديل النتيجة الكلية
              </Button>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-line-subtle bg-surface-3 p-2">
                <span className="text-[length:var(--fs-text-xs)] text-fg-muted">النتيجة:</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={overrideScoreInput}
                  onChange={(e) => setOverrideScoreInput(e.target.value)}
                  className="h-8 w-20 text-center text-sm"
                />
                <span className="text-[length:var(--fs-text-xs)] text-fg-muted">من {attempt.gradeOutOf}</span>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveScoreOverride}
                  disabled={scoreOverridePending}
                  className="h-8 px-2.5 text-xs"
                >
                  <Check className="size-3.5 me-1" />
                  حفظ
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingScore(false)}
                  className="h-8 px-2 text-xs"
                >
                  إلغاء
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Filter tabs */}
      {attempt.questions.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={filter === 'all' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFilter('all')}
            className="text-[length:var(--fs-text-xs)]"
          >
            كل الأسئلة ({attempt.questions.length})
          </Button>

          {pendingQuestions.length > 0 ? (
            <Button
              type="button"
              variant={filter === 'pending' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFilter('pending')}
              className="text-[length:var(--fs-text-xs)]"
            >
              محتاج تصحيح ({pendingQuestions.length})
            </Button>
          ) : null}

          {wrongQuestions.length > 0 ? (
            <Button
              type="button"
              variant={filter === 'wrong' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFilter('wrong')}
              className="text-[length:var(--fs-text-xs)]"
            >
              الإجابات الخاطئة ({wrongQuestions.length})
            </Button>
          ) : null}

          {correctQuestions.length > 0 ? (
            <Button
              type="button"
              variant={filter === 'correct' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFilter('correct')}
              className="text-[length:var(--fs-text-xs)]"
            >
              الإجابات الصحيحة ({correctQuestions.length})
            </Button>
          ) : null}
        </div>
      ) : null}

      {filteredQuestions.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-10 text-center">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">
            لا توجد أسئلة تطابق الفلتر المحدد.
          </p>
        </div>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {filteredQuestions.map((question) => (
            <li key={question.attemptQuestionId}>
              <GradeAnswerCard
                attemptId={attempt.attemptId}
                question={question}
                onGraded={setTotal}
              />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
