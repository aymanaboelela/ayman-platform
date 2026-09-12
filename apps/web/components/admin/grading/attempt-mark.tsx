'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { markAttemptAction } from '@/app/(admin)/admin/grading/actions';

const c = copy.admin.grading;
const STARS = [1, 2, 3, 4, 5] as const;

export interface AttemptMarkProps {
  attemptId: string;
  studentName: string;
  instructorRating: number | null;
  onHonorBoard: boolean;
}

/**
 * «أقيّمه» و«حطه في لوحة الشرف» — the two judgements that live on a row.
 *
 * ## Why a rating exists at all
 *
 * The score cannot answer the question being asked. Ten students reach 100/100
 * on a monthly exam and only one of them can be الأول; what separates them is
 * how the papers were written, which is a reading and not a calculation. The
 * ranking orders on this first and on the percentage second, so a rated paper
 * always outranks an unrated one of the same score.
 *
 * ## The board asks before it publishes
 *
 * Adding a paper to لوحة الشرف puts that student's NAME AND PHOTOGRAPH on the
 * public landing page, where anyone on the internet can see them. So it
 * confirms, by name, every time — and the sentence says exactly what will
 * become public rather than «متأكد؟». Removing needs no confirmation: taking a
 * child's photo down is never the dangerous direction.
 *
 * ## Optimistic, and honest when it fails
 *
 * Both controls write through immediately and the row re-renders from the
 * server after. A star that lights up and then silently does not save is worse
 * than a slow one, so a failed write puts the previous value back and says so.
 */
export function AttemptMark({
  attemptId,
  studentName,
  instructorRating,
  onHonorBoard,
}: AttemptMarkProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rating, setRating] = useState(instructorRating);
  const [onBoard, setOnBoard] = useState(onHonorBoard);
  const [failed, setFailed] = useState(false);

  function write(patch: { instructorRating?: number | null; onHonorBoard?: boolean }) {
    const previousRating = rating;
    const previousBoard = onBoard;
    if (patch.instructorRating !== undefined) setRating(patch.instructorRating);
    if (patch.onHonorBoard !== undefined) setOnBoard(patch.onHonorBoard);
    setFailed(false);

    startTransition(async () => {
      const result = await markAttemptAction(attemptId, patch);
      if (!result.ok) {
        setRating(previousRating);
        setOnBoard(previousBoard);
        setFailed(true);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <div
        className="flex items-center gap-0.5"
        role="group"
        aria-label={`${c.ratingLabel} — ${studentName}`}
      >
        {STARS.map((value) => (
          <button
            key={value}
            type="button"
            disabled={pending}
            title={String(value)}
            aria-pressed={rating !== null && value <= rating}
            /* Pressing the star that is already the rating CLEARS it. A
               five-star paper otherwise has no way back to unrated except a
               separate control nobody would find. */
            onClick={() => write({ instructorRating: rating === value ? null : value })}
            className="p-0.5 disabled:opacity-50"
          >
            <Star
              className={cn(
                'size-4 transition-colors',
                rating !== null && value <= rating
                  ? 'fill-accent text-accent'
                  : 'text-fg-muted',
              )}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (onBoard) {
            write({ onHonorBoard: false });
            return;
          }
          // By name, and saying what becomes public — «متأكد؟» would not.
          if (!window.confirm(formatCopy(c.honorConfirm, { name: studentName }))) return;
          write({ onHonorBoard: true });
        }}
        className={cn(
          'rounded-full border px-2.5 py-1 text-[length:var(--fs-text-xs)] font-medium',
          'transition-colors duration-[160ms] ease-out disabled:opacity-50',
          onBoard
            ? 'border-accent bg-accent/15 text-accent-text'
            : 'border-line text-fg-muted hover:border-accent/40 hover:text-fg',
        )}
      >
        {onBoard ? c.honorOn : c.honorAdd}
      </button>

      {failed ? (
        <span role="status" className="text-[length:var(--fs-text-xs)] text-[color:var(--err)]">
          {c.honorFailed}
        </span>
      ) : null}
    </div>
  );
}
