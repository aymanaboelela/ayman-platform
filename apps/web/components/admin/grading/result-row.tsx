import Link from 'next/link';
import { CheckCheck, Timer } from 'lucide-react';
// `/copy/admin`, never the root barrel — this only renders inside /admin.
import { copy } from '@ayman/contracts/copy/admin';
import type { AdminGradedRow } from '@ayman/contracts/admin/exams';
import { formatCopy, formatMark } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';

const c = copy.admin.grading;

/** Same formatter the queue uses — no year, Western digits, fixed order. */
const submittedAtFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * How long the sitting took, as a sentence.
 *
 * Minutes above one, seconds below it. «خلّص في ٠ دقيقة» is what rounding
 * alone produces for a paper answered in forty seconds, and on «الأسرع» — the
 * order this figure exists to serve — that is precisely the row at the top.
 */
function describeDuration(seconds: number): string {
  if (seconds < 60) return formatCopy(c.rowDurationSeconds, { n: seconds });
  return formatCopy(c.rowDuration, { n: Math.round(seconds / 60) });
}

export interface ResultRowProps {
  row: AdminGradedRow;
  /**
   * The position on «الأوائل», 1-based — `null` on «اتصحّح خلاص», which is a
   * record of work done and not a ranking. A rank rendered on a list that is
   * sorted by date would read as a standing nobody earned.
   */
  rank: number | null;
}

/**
 * One finished sitting, on either of the two new sections.
 *
 * ## One row shape for both
 *
 * «اتصحّح خلاص» and «الأوائل» are the same fact ordered two ways — a paper,
 * who sat it, and what it came to — so they are one component with one prop
 * (`rank`) that differs, rather than two that drift.
 *
 * ## The layout, and why it is a grid and not a flex row
 *
 * Three things have to stay legible at 360px: who, what they got, and the way
 * in. A flex row with four meta items wraps into a ragged block on a phone. So
 * the identity column flexes, the score is a fixed-width tabular block pinned
 * to the inline-end, and the meta line underneath is the only part allowed to
 * wrap. `truncate` is on the exam title alone — on the whole row it would blow
 * out the grid track (a `nowrap` meta line is what once made a lesson page
 * wider than the phone).
 *
 * ## The name is a link, and the row is not
 *
 * Same rule as the queue row beside it: two destinations (the student's record,
 * and the paper), so no stretched pseudo-element over the card.
 */
export function ResultRow({ row, rank }: ResultRowProps) {
  const scored = row.scaledScore !== null;

  return (
    <div
      className={cn(
        'relative flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface-2 p-4',
        'transition-colors duration-[160ms] ease-out hover:border-line-strong focus-within:border-line-strong',
      )}
    >
      {/*
        The rank medallion. Only the top three get the accent — a numbered list
        where every number is gold is a list with no top three in it.
      */}
      {rank !== null ? (
        <span
          aria-hidden="true"
          className={cn(
            'mono grid size-9 shrink-0 place-items-center rounded-lg text-[length:var(--fs-text-sm)] font-semibold tabular-nums',
            rank <= 3
              ? 'bg-accent/15 text-accent-text'
              : 'bg-surface-3 text-fg-muted',
          )}
        >
          {formatCopy(c.rowRank, { n: rank })}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-3 text-fg-muted"
        >
          <CheckCheck className="size-[1.125rem]" />
        </span>
      )}

      {/* `basis-[12rem]` with `flex-1`: the identity column keeps a floor wide
          enough for an Arabic full name and then gives the rest back, so the
          score and the button sit beside it on a desktop and drop below it on
          a phone without either of them being squeezed to nothing. */}
      <div className="min-w-0 flex-1 basis-[12rem]">
        <Link
          href={`/admin/students/${row.studentUserId}`}
          title={c.openProfile}
          className="text-[length:var(--fs-text-base)] font-semibold text-fg underline-offset-4 hover:underline"
        >
          {row.studentName}
        </Link>
        <p className="mt-0.5 truncate text-[length:var(--fs-text-sm)] text-fg-muted">
          {row.quizTitle}
        </p>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
          {row.submittedAt ? (
            <span className="tabular-nums">
              {submittedAtFormatter.format(new Date(row.submittedAt))}
            </span>
          ) : null}
          {row.durationSeconds !== null ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Timer className="size-3.5" aria-hidden="true" />
              {describeDuration(row.durationSeconds)}
            </span>
          ) : null}
          {/* Only on the ranking, where it is the one thing that distinguishes
              a paper he marked from one the engine did. On «اتصحّح خلاص» every
              row is hand-marked by definition, and a badge that is always
              present is not a badge. */}
          {rank !== null && row.handMarked ? (
            <span className="text-accent-text">{c.rowHandMarked}</span>
          ) : null}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="mono text-[length:var(--fs-title-4)] font-semibold tabular-nums text-fg">
          {scored
            ? formatCopy(c.rowScore, {
                score: formatMark(row.scaledScore ?? 0),
                outOf: formatMark(row.gradeOutOf),
              })
            : '—'}
        </span>
        {row.percent !== null ? (
          <span className="mono text-[length:var(--fs-text-xs)] tabular-nums text-fg-muted">
            {row.percent}%
          </span>
        ) : null}
      </div>

      <Link href={`/admin/grading/${row.attemptId}`} className="chip chip--quiet shrink-0">
        {c.openPaper}
      </Link>
    </div>
  );
}
