import Link from 'next/link';
import { PenLine } from 'lucide-react';
// `/copy/admin`, never the root barrel: this row only ever renders inside the
// admin layout, and `copy.admin.*` lives in that module.
import { copy } from '@ayman/contracts/copy/admin';
import type { AdminGradingQueue } from '@ayman/contracts/admin/exams';
import { formatCopy, formatMark } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';

const c = copy.admin.grading;

/** The queue contract carries no row type of its own — one row is one element
 *  of `rows`, and deriving it here keeps the two from drifting apart. */
export type GradingQueueRowData = AdminGradingQueue['rows'][number];

/**
 * Western digits and a fixed order, the same rule every date on this platform
 * follows. No year: this is a queue read to be emptied, so the useful part is
 * the day and the hour, and `/admin/grading/[attemptId]` spells the year out in
 * full for the one paper being marked.
 */
const submittedAtFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * One paper waiting on a human.
 *
 * ## Every row is amber, and that is not decoration
 *
 * `/admin/homework` tints only its pending rows because that queue has four
 * filters and shows decided work too. This list has one state: everything on it
 * is waiting, and until it is marked every one of these answers is scoring the
 * student ZERO in a total the platform already believes. So the whole row reads
 * as actionable — amber is action here, and the action is «صحّح».
 *
 * ## Two destinations, so no stretched link
 *
 * This row used to put `after:absolute after:inset-0` on the «صحّح» chip and
 * make the whole card one hit area, on the stated grounds that the queue's
 * contract carried no student id and there was therefore no second place to
 * go. It carries one now: «أضغط عليها أروح البروفايل بتاعها»، and the profile
 * is where the conversation with that student lives.
 *
 * So the shape reverts to `/admin/homework`'s — a plain container with two
 * ordinary links inside it. A stretched pseudo-element would sit ON TOP of the
 * name and swallow its clicks, and nesting one `<a>` inside another is invalid
 * HTML that browsers resolve by silently dropping one. The card is no longer
 * clickable as a whole; the two things worth pressing are.
 */
export function GradingQueueRow({ row }: { row: GradingQueueRowData }) {
  return (
    <div
      className={cn(
        'relative flex items-start gap-3 rounded-xl border border-accent/40 bg-surface-2 p-4',
        'transition-colors duration-[160ms] ease-out hover:border-accent/50 focus-within:border-accent/50',
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent-text"
      >
        <PenLine className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <Link
          href={`/admin/students/${row.studentUserId}`}
          title={c.openProfile}
          className="text-[length:var(--fs-text-base)] font-semibold text-fg underline-offset-4 hover:underline"
        >
          {row.studentName}
        </Link>
        <p className="mt-0.5 truncate text-[length:var(--fs-text-sm)] text-fg">{row.quizTitle}</p>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
          {/* Nullable in the contract — an attempt can sit in this queue with no
              submission stamp (an abandoned paper the engine closed), and a
              formatted `new Date(null)` would print «١٩٧٠». */}
          {row.submittedAt ? (
            <span className="tabular-nums">
              {submittedAtFormatter.format(new Date(row.submittedAt))}
            </span>
          ) : null}
          <span className="tabular-nums">{formatCopy(c.pending, { n: row.pendingCount })}</span>
          {/* What is actually at stake. «٢ سؤال» reads the same whether the two
              questions are worth two marks or fifty, and on a midterm they are
              fifty — the student is looking at a provisional near-fail until
              this row is cleared. */}
          {row.pendingMarks > 0 ? (
            <span className="tabular-nums text-accent-text">
              {formatCopy(c.pendingMarks, {
                marks: formatMark(row.pendingMarks),
                outOf: formatMark(row.gradeOutOf),
              })}
            </span>
          ) : null}
        </p>
      </div>

      <Link href={`/admin/grading/${row.attemptId}`} className="chip chip--solid shrink-0">
        {c.open}
      </Link>
    </div>
  );
}
