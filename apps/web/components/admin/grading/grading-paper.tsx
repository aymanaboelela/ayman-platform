'use client';

import { useState } from 'react';
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
export function GradingPaper({ attempt, submittedAtLabel }: GradingPaperProps) {
  const [total, setTotal] = useState<number | null>(attempt.scaledScore);

  return (
    <>
      <header className="rounded-xl border border-line bg-surface-2 p-4 sm:p-5">
        <h1 className="text-[length:var(--fs-title-3)] font-semibold text-fg">
          {attempt.studentName}
        </h1>
        <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg">{attempt.quizTitle}</p>
        {submittedAtLabel ? (
          <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted tabular-nums">
            {submittedAtLabel}
          </p>
        ) : null}

        {/* Amber, because it is the thing this screen is FOR — not a status
            colour and not correctness (green/red stay reserved for that). */}
        <p
          aria-live="polite"
          className="mt-3 inline-flex rounded-[var(--r-md)] border border-[color-mix(in_oklch,var(--a-9),transparent_70%)] bg-accent/10 px-3 py-1.5 text-[length:var(--fs-text-sm)] font-semibold text-accent-text tabular-nums"
        >
          {total === null
            ? // An em dash, not a zero. A paper with nothing gradeable in it has
              // no total, and printing 0 is the same lie as a pre-filled mark box.
              '—'
            : formatCopy(c.totalNow, {
                score: formatMark(total),
                outOf: formatMark(attempt.gradeOutOf),
              })}
        </p>
      </header>

      {attempt.questions.length === 0 ? (
        /* Reachable from a stale queue tab whose papers someone else has since
           finished — an ordinary outcome, not a fault, so it reads as an empty
           queue rather than as an error. */
        <div className="mt-4 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-10 text-center">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.empty}</p>
        </div>
      ) : (
        /* `<ol>`: the slots are in the order the student sat them, and the
           number printed on each card is that position. */
        <ol className="mt-4 flex flex-col gap-3">
          {attempt.questions.map((question) => (
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
