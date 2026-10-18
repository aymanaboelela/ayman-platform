'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { copy } from '@ayman/contracts/copy';
import { apiGet } from '@/lib/api';
import { SubmitConfirmDialog, type SubmitDialogQuestion } from './submit-confirm-dialog';

const PreflightSchema = z.object({ unansweredCount: z.number(), total: z.number() });

export interface SubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attemptId: string;
  /**
   * The runner's OWN view of the paper — used for the jump-to chips and the
   * flagged row only. The headline COUNT never comes from this: it is
   * re-fetched from `GET .../preflight` the instant the dialog opens, so a
   * failed autosave cannot make «لسه فيه ٣ أسئلة» lie into «كل الأسئلة اتجاوبت».
   */
  questions: readonly SubmitDialogQuestion[];
  /** Timed papers only — the bar's own anchor pair, so both clocks agree. */
  deadlineAt?: string | null;
  serverTime: string;
  onJump: (slotPosition: number) => void;
  onConfirm: () => Promise<void>;
}

/**
 * The exam's submit confirmation: `SubmitConfirmDialog` with the server's
 * count behind it.
 */
export function SubmitDialog({
  open,
  onOpenChange,
  attemptId,
  questions,
  deadlineAt,
  serverTime,
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
    <SubmitConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={copy.quiz.submitConfirmTitle}
      description={copy.quiz.submitConfirmBody}
      questions={questions}
      unansweredCount={error ? null : unansweredCount}
      countFailed={error}
      onRetryCount={() => {
        setError(false);
        setUnansweredCount(null);
        setRetryNonce((nonce) => nonce + 1);
      }}
      clock={deadlineAt ? { deadlineAt, serverTime } : null}
      onJump={onJump}
      onConfirm={() => void confirm()}
      submitting={submitting}
      // While the count is in flight, confirm waits for it — so a student
      // cannot hand in a paper the dialog has not finished describing. Once
      // the fetch has FAILED it goes live again: the server recounts anyway.
      confirmDisabled={unansweredCount === null && !error}
      confirmLabel={copy.quiz.submitConfirmAction}
      submittingLabel={copy.quiz.submitting}
      cancelLabel={copy.quiz.submitCancel}
    />
  );
}
