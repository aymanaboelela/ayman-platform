'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { copy, formatCopy } from '@ayman/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui';
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
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={copy.admin.common.close}>
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
                <ul className="flex flex-wrap gap-2">
                  {locallyUnanswered.map((slotPosition) => (
                    <li key={slotPosition}>
                      <button
                        type="button"
                        onClick={() => {
                          onOpenChange(false);
                          onJump(slotPosition);
                        }}
                        className="mono flex size-8 items-center justify-center rounded-sm border border-line bg-surface-3 text-[length:var(--fs-text-sm)] text-fg hover:border-accent"
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
            {copy.quiz.submitConfirmAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
