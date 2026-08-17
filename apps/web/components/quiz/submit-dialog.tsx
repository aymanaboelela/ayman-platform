'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { cn } from '@ayman/ui/lib/cn';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { apiGet } from '@/lib/api';

const PreflightSchema = z.object({ unansweredCount: z.number(), total: z.number() });

export interface SubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attemptId: string;
  /**
   * The client's OWN best-known unanswered slots — used only to render
   * jump-to chips. The headline COUNT never comes from this: it is always
   * re-fetched from `GET .../preflight` the instant the dialog opens, so a
   * failed autosave cannot make "you have 3 unanswered" lie into "0".
   */
  locallyUnanswered: readonly number[];
  onJump: (slotPosition: number) => void;
  onConfirm: () => Promise<void>;
}

export function SubmitDialog({
  open,
  onOpenChange,
  attemptId,
  locallyUnanswered,
  onJump,
  onConfirm,
}: SubmitDialogProps) {
  const [unansweredCount, setUnansweredCount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    // The count is advisory — the server recomputes it on submit — so a failed
    // preflight must NOT wedge the dialog: on error we surface a retry and keep
    // confirm enabled, instead of rendering "loading" forever (I11). State is
    // only ever set from inside the async callbacks (never synchronously in the
    // effect body — see `react-hooks/set-state-in-effect`); `error` is cleared
    // on success and by the retry handler, so a reopen refetches cleanly.
    if (!open) return;
    let cancelled = false;
    void apiGet(`/api/quiz/attempts/${attemptId}/preflight`, PreflightSchema)
      .then((result) => {
        if (cancelled) return;
        setError(false);
        setUnansweredCount(result.unansweredCount);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, attemptId, retryNonce]);

  async function confirm() {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      // Reset on EVERY settle, the successful one included — which does mean
      // the button goes live again for the moment between `router.push` being
      // called and the review page committing. The tidier-looking alternative
      // (latch `submitting` and let the navigation unmount it) is only correct
      // if this component can tell a submission that navigated away from one
      // that failed and stayed, and it cannot: `onConfirm` is the runner's
      // `submitOnce`, which catches its own failures (toast, stay put) and
      // therefore RESOLVES on all three paths — submitted, already-submitted,
      // failed. Latch on that and a student whose POST failed is left staring
      // at «بيتسلّم…» on a permanently dead button, mid timed exam, with no way
      // back except cancelling and reopening the dialog. A button that is
      // briefly live again is the cheaper of the two wrong answers; closing
      // that last gap properly means the runner reporting whether it
      // navigated, which is a change to its `onConfirm` contract.
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={copy.common.close}>
        <DialogHeader>
          <DialogTitle>{copy.quiz.submitConfirmTitle}</DialogTitle>
          <DialogDescription>{copy.quiz.submitConfirmBody}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {error ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-fg">{copy.common.error}</p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setError(false);
                  setUnansweredCount(null);
                  setRetryNonce((nonce) => nonce + 1);
                }}
              >
                {copy.common.retry}
              </Button>
            </div>
          ) : unansweredCount === null ? (
            <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">{copy.common.loading}</p>
          ) : unansweredCount === 0 ? (
            <p className="text-fg">{copy.quiz.submitConfirmAllAnswered}</p>
          ) : (
            <>
              <p className="text-fg">{formatCopy(copy.quiz.submitConfirmUnanswered, { count: unansweredCount })}</p>
              {locallyUnanswered.length > 0 ? (
                /*
                  44×44 below `md`, and the 32px these always were from `md`
                  up — the same shape as `DialogContent`'s own close button
                  (`size-11 md:size-6`) and as `.nav-chip` in study.css, which
                  takes 36px to 44 under the same breakpoint.

                  These are the worse case of the two, though, and were missed
                  because they live in a dialog rather than on the page. A
                  question-map chip is pressed while browsing; one of these is
                  pressed by a student who has already decided to submit, has
                  just been told they left questions blank, and is under a
                  countdown. At 32px squares 8px apart, the neighbouring chip
                  is a plausible thumb landing — and a mis-tap here does not
                  merely navigate, it also closes the dialog on the way out
                  (`onOpenChange(false)` below), so recovering costs a second
                  round trip through preflight.

                  Only the box grows: the two mono digits keep
                  `--fs-text-sm` and stay centred, so above `md` nothing moves
                  at all. A long unanswered list now wraps onto more rows than
                  it did — `DialogContent` caps itself at
                  `100dvh - 2rem` with `overflow-y-auto`, so the footer stays
                  reachable however many there are.
                */
                <ul className="flex flex-wrap gap-2">
                  {locallyUnanswered.map((slotPosition) => (
                    <li key={slotPosition}>
                      <button
                        type="button"
                        onClick={() => {
                          onOpenChange(false);
                          onJump(slotPosition);
                        }}
                        className="mono flex size-11 items-center justify-center rounded-sm border border-line bg-surface-3 text-[length:var(--fs-text-sm)] text-fg hover:border-accent md:size-8"
                      >
                        {String(slotPosition + 1).padStart(2, '0')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter>
          {/* Cancel is the default-focused action — the single-attempt,
              no-undo trap this dialog exists to prevent means "changed my
              mind" must be the path requiring zero extra keystrokes. */}
          <Button type="button" variant="secondary" autoFocus onClick={() => onOpenChange(false)}>
            {copy.quiz.submitCancel}
          </Button>
          <Button
            type="button"
            onClick={() => void confirm()}
            disabled={submitting || (unansweredCount === null && !error)}
          >
            {/*
              The LABEL carries the pending state, because `disabled` on its
              own does not: it resolves to `disabled:opacity-50`, and a
              slightly faded button is indistinguishable from a button that
              ignored the tap. Behind it sits a flush of the last answer, a
              POST to /submit and a client navigation to the review page —
              three to eight seconds on the 3G most of this product is read on,
              inside a modal, where the browser's own loading indicator is not
              visible either. Nothing actually breaks when the student presses
              again (the runner's `submitOnce` guard swallows it); they simply
              conclude the highest-stakes tap in the product failed, and start
              hunting for another way to submit while the clock runs.

              Both labels are rendered into the SAME grid cell with the
              inactive one hidden, so the button is permanently as wide as the
              longer of the two and the swap cannot shift «ارجع للأسئلة»
              sideways under a thumb already on its way down. A `min-w-*`
              guess would have to be re-measured every time either string is
              reworded; this measures itself. `invisible` rather than
              `opacity-0` because `visibility: hidden` also takes the spare
              label out of the accessibility tree — with `opacity-0` a screen
              reader announces the button as «أيوه، نسلّم بيتسلّم…».
            */}
            <span className="grid">
              <span className={cn('col-start-1 row-start-1', submitting && 'invisible')}>
                {copy.quiz.submitConfirmAction}
              </span>
              <span className={cn('col-start-1 row-start-1', !submitting && 'invisible')}>
                {copy.quiz.submitting}
              </span>
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
