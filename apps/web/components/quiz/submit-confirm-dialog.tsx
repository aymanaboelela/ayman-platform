'use client';

import { useRef } from 'react';
import { AlertCircle, CheckCheck, Clock, Flag, Loader2, RotateCcw } from 'lucide-react';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { copy } from '@ayman/contracts/copy';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { cn } from '@ayman/ui/lib/cn';
import { useServerCountdown } from './quiz-timer';

const x = quizExperience.submit;

/** Five minutes and one — the clock's own two escalations (`quiz-timer.tsx`). */
const WARN_SECONDS = 300;
const CRITICAL_SECONDS = 60;

/** One question of the paper, as the confirmation needs to see it. */
export interface SubmitDialogQuestion {
  slotPosition: number;
  /** 1-based, as the student counts — «سؤال ٣». */
  number: number;
  answered: boolean;
  flagged: boolean;
}

export interface SubmitConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** The whole paper, from what the runner itself knows — drives the chips. */
  questions: readonly SubmitDialogQuestion[];
  /** The HEADLINE count. `null` while it is still being fetched; the quiz
   *  runner's comes from the server, the practice runner's is local. */
  unansweredCount: number | null;
  /** The count could not be fetched. The confirm button stays live. */
  countFailed?: boolean;
  onRetryCount?: () => void;
  /** A timed paper's clock. Absent on an untimed one. */
  clock?: { deadlineAt: string; serverTime: string } | null;
  /** Called AFTER the dialog has closed, with the slot the student picked. */
  onJump: (slotPosition: number) => void;
  onConfirm: () => void;
  submitting: boolean;
  /** Confirm is disabled until the count is in — see `SubmitDialog`. */
  confirmDisabled?: boolean;
  confirmLabel: string;
  submittingLabel: string;
  cancelLabel: string;
  /** A failed submission, said inside the dialog the student is looking at. */
  error?: string | null;
}

/**
 * «نسلّم الامتحان؟» — the one confirmation in the product that cannot be undone.
 *
 * Presentational, and shared: the quiz runner wraps it with the server's
 * preflight count (`submit-dialog.tsx`), the book-practice runner hands it a
 * local one. Its own module rather than a second export on `submit-dialog.tsx`,
 * because a new export on an existing client module is `undefined` in a tab
 * that outlived the deploy — and this is the screen a student is mid-exam on.
 *
 * ## What it says, in order
 *
 * The verdict first, in one line a student can take in under a running clock
 * («لسه فيه سؤالين من غير إجابة»), with the number agreeing with its noun —
 * `arabicCount`, never `'{n} سؤال'`, which read «1 سؤال» and «3 سؤال». Then each
 * blank question as a chip that goes straight to it, and the flagged ones as a
 * second, labelled row: a flag is a note the student left themself for exactly
 * this moment, and the dialog was the one place it was never shown. Then the
 * time left, in minutes. Then the two buttons.
 *
 * ## Colour
 *
 * No green and no red, for the reason `.nav-chip` gives: this is two clicks
 * from the screen where those mean «صح» and «غلط», and «all answered» in green
 * reads as «all right». The caution is the clock's own `--warn`, on the well
 * and the rule only; the chips are amber because they are what you press.
 *
 * ## Focus
 *
 * «الرجوع للأسئلة» is focused on open — changing one's mind must cost nothing
 * — and a jump does not hand focus back to the submit button the dialog was
 * opened from (Radix's default, which would leave a keyboard on the paper's
 * last control while the screen shows its first): the runner moves it to the
 * question it opened.
 */
export function SubmitConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  questions,
  unansweredCount,
  countFailed = false,
  onRetryCount,
  clock = null,
  onJump,
  onConfirm,
  submitting,
  confirmDisabled = false,
  confirmLabel,
  submittingLabel,
  cancelLabel,
  error = null,
}: SubmitConfirmDialogProps) {
  // Set by a chip, read once the dialog has actually closed.
  const pendingJumpRef = useRef<number | null>(null);

  const blank = questions.filter((question) => !question.answered);
  const flaggedAnswered = questions.filter((question) => question.flagged && question.answered);

  const state: 'counting' | 'error' | 'open' | 'done' =
    unansweredCount === null ? (countFailed ? 'error' : 'counting') : unansweredCount > 0 ? 'open' : 'done';
  // Local knowledge of WHICH ones, shown unless the authority says none.
  const showBlank = state !== 'done' && blank.length > 0;

  function jump(slotPosition: number) {
    pendingJumpRef.current = slotPosition;
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={copy.common.close}
        onCloseAutoFocus={(event) => {
          const target = pendingJumpRef.current;
          if (target === null) return;
          pendingJumpRef.current = null;
          event.preventDefault();
          onJump(target);
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <section className="submit-check" data-state={state} aria-live="polite">
            <div className="submit-check__head">
              <span className="submit-check__well" aria-hidden="true">
                {state === 'counting' ? (
                  <Loader2 className="size-[1.125rem] motion-safe:animate-spin" />
                ) : state === 'done' ? (
                  <CheckCheck className="size-[1.125rem]" />
                ) : (
                  <AlertCircle className="size-[1.125rem]" />
                )}
              </span>
              <div className="submit-check__text">
                <p className="submit-check__title">
                  {state === 'counting'
                    ? x.counting
                    : state === 'error'
                      ? x.countFailed
                      : state === 'open'
                        ? arabicCount(unansweredCount ?? 0, x.unanswered)
                        : copy.quiz.submitConfirmAllAnswered}
                </p>
                {state === 'open' ? <p className="submit-check__body">{x.unansweredAsk}</p> : null}
              </div>
              {state === 'error' && onRetryCount ? (
                <Button type="button" variant="secondary" size="sm" onClick={onRetryCount} className="shrink-0">
                  <RotateCcw className="size-4" aria-hidden="true" />
                  {x.countRetry}
                </Button>
              ) : null}
            </div>

            {showBlank ? (
              <JumpGroup label={x.groupUnanswered}>
                {blank.map((question) => (
                  <li key={question.slotPosition}>
                    <button
                      type="button"
                      className="submit-chip"
                      aria-label={formatCopy(x.chipUnanswered, { n: question.number })}
                      onClick={() => jump(question.slotPosition)}
                    >
                      {question.flagged ? <Flag className="size-3.5" aria-hidden="true" fill="currentColor" /> : null}
                      {formatCopy(copy.quiz.questionNumber, { n: question.number })}
                    </button>
                  </li>
                ))}
              </JumpGroup>
            ) : null}

            {flaggedAnswered.length > 0 ? (
              <JumpGroup label={x.groupFlagged}>
                {flaggedAnswered.map((question) => (
                  <li key={question.slotPosition}>
                    <button
                      type="button"
                      className="submit-chip submit-chip--flagged"
                      aria-label={formatCopy(x.chipFlagged, { n: question.number })}
                      onClick={() => jump(question.slotPosition)}
                    >
                      <Flag className="size-3.5" aria-hidden="true" fill="currentColor" />
                      {formatCopy(copy.quiz.questionNumber, { n: question.number })}
                    </button>
                  </li>
                ))}
              </JumpGroup>
            ) : null}

            {showBlank || flaggedAnswered.length > 0 ? <p className="submit-check__hint">{x.jumpHint}</p> : null}
          </section>

          {/* Only while the dialog is open: `SubmitClock` owns its own tick,
              so the runner behind it — which holds the whole paper — is not
              re-rendered once a second to keep a sentence current. */}
          {clock ? <SubmitClock deadlineAt={clock.deadlineAt} serverTime={clock.serverTime} /> : null}

          {/* `role="alert"`: the student's eyes are on the button they just
              pressed, and the failure has to reach them without the focus
              moving off it. */}
          {error ? (
            <p role="alert" className="submit-check__error">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          {/* Focused on open — see the docblock. */}
          <Button type="button" variant="secondary" autoFocus onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting || confirmDisabled} aria-busy={submitting}>
            {/*
              The LABEL carries the pending state, because `disabled` alone does
              not: it resolves to `disabled:opacity-50`, and a slightly faded
              button is indistinguishable from one that ignored the tap. Behind
              it sit a flush of the last answer, a POST and a navigation —
              seconds, on 3G, inside a modal where the browser's own loading
              indicator is not visible either.

              Both labels share ONE grid cell with the inactive one hidden, so
              the button is always as wide as the longer of the two and the swap
              cannot shift the cancel button sideways under a thumb already on
              its way down. `invisible` rather than `opacity-0`, because
              `visibility: hidden` also takes the spare label out of the
              accessibility tree.
            */}
            <span className="grid">
              <span className={cn('col-start-1 row-start-1', submitting && 'invisible')}>{confirmLabel}</span>
              <span
                className={cn(
                  'col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5',
                  !submitting && 'invisible',
                )}
              >
                <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
                {submittingLabel}
              </span>
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JumpGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="submit-check__group">
      <p className="submit-check__label">{label}</p>
      <ul className="submit-check__chips">{children}</ul>
    </div>
  );
}

/**
 * The time left, in minutes — the exact seconds are on the bar behind the
 * dialog, and a second ticking clock inside a confirmation is pressure, not
 * information. Counted against the SERVER's clock (`useServerCountdown`), like
 * the bar, so the two can never disagree about how long is left.
 */
function SubmitClock({ deadlineAt, serverTime }: { deadlineAt: string; serverTime: string }) {
  const remainingMs = useServerCountdown(deadlineAt, serverTime);
  const seconds = remainingMs === null ? null : Math.ceil(remainingMs / 1000);
  const tone =
    seconds === null ? undefined : seconds <= CRITICAL_SECONDS ? 'critical' : seconds <= WARN_SECONDS ? 'warn' : undefined;

  return (
    // Rendered from the first frame, empty until the first tick, so the
    // footer does not move when the sentence lands.
    <p className="submit-clock" data-tone={tone}>
      <Clock className="size-4 shrink-0" aria-hidden="true" />
      {seconds === null ? null : (
        <span>
          <span className="submit-clock__left">
            {seconds < 60 ? x.timeUnderMinute : arabicCount(Math.floor(seconds / 60), x.timeLeft)}
          </span>
          {seconds > WARN_SECONDS ? <span className="submit-clock__note"> · {x.timeEnough}</span> : null}
        </span>
      )}
    </p>
  );
}
