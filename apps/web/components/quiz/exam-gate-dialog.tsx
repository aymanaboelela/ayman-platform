'use client';

import { AlarmClock, Focus, Repeat2, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { QuizPaper } from '@ayman/contracts/quiz/quiz-settings';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { ExamGateMark } from './exam-gate-mark';

const c = copy.examGate;

export interface ExamGateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which sitting is about to begin — this picks the entire copy set. */
  paper: QuizPaper;
  /** Whether this quiz is a final exam offering an improvement sitting. */
  allowsImprovement: boolean;
  durationSeconds: number | null;
  pending: boolean;
  /**
   * A failure from `onConfirm`, already translated. Rendered inside the dialog
   * rather than as a toast because the dialog is modal — a toast behind it is
   * either invisible or dismissed by the overlay, which is how «ابدأ» came to
   * look like it did nothing at all.
   */
  error?: string | null;
  onConfirm: () => void;
}

interface Point {
  icon: LucideIcon;
  title: string;
  body: string;
}

/**
 * The gate a student passes through before their first question.
 *
 * ## Why it exists
 *
 * A student used to press «ابدأ الامتحان» and be dropped straight into a timed,
 * single-sitting, permanently-recorded paper with no statement anywhere that
 * any of those three things were true. Every one of them is a surprise you can
 * only discover by losing something.
 *
 * So the dialog states them, in that order, and the student confirms. The
 * confirmation is not decoration: `start()` records `acknowledged: true` on the
 * `attempt_started` event, so "they were told" ends up in an append-only log
 * rather than being a claim about a component that may never have rendered.
 *
 * ## Two papers, two dialogs
 *
 * The improvement sitting gets its OWN copy rather than a shortened version of
 * this one, because a student reaching it needs different facts: the questions
 * will not be the ones they just sat, and — the fact that decides whether they
 * press at all — a worse result cannot cost them the mark they already hold.
 * Telling them "your grade is recorded permanently" a second time, without
 * that, would read as a threat and stop people improving.
 *
 * ## Not dismissible by accident
 *
 * `onOpenChange` is passed straight through, so Escape and the overlay still
 * close it — this is a gate, not a trap, and a student who opened it by mistake
 * must be able to leave. What it does NOT have is a default-focused confirm
 * button: the primary action is reached deliberately.
 */
export function ExamGateDialog({
  open,
  onOpenChange,
  paper,
  allowsImprovement,
  durationSeconds,
  pending,
  error = null,
  onConfirm,
}: ExamGateDialogProps) {
  const improving = paper === 'improvement';

  const timing = durationSeconds
    ? formatCopy(c.timedBody, { minutes: Math.round(durationSeconds / 60) })
    : c.untimedBody;

  const points: Point[] = improving
    ? [
        { icon: Sparkles, title: c.improveDifferentTitle, body: c.improveDifferentBody },
        { icon: ShieldCheck, title: c.improveSafeTitle, body: c.improveSafeBody },
        { icon: AlarmClock, title: c.focusTitle, body: timing },
      ]
    : [
        { icon: Focus, title: c.focusTitle, body: c.focusBody },
        { icon: ShieldCheck, title: c.recordedTitle, body: c.recordedBody },
        {
          icon: allowsImprovement ? Repeat2 : AlarmClock,
          title: c.onceTitle,
          // On an improvable exam this is genuinely different news — "one
          // sitting, then one improvement" — and saying "you get one attempt,
          // full stop" to a student who actually has two is simply wrong.
          body: allowsImprovement ? c.onceExamBody : c.onceBody,
        },
      ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `close`, not `c.cancel`. The footer already carries a button named
          «مش دلوقتي»; giving the X the same accessible name puts two controls
          with one name in the same dialog, which is ambiguous to a screen
          reader and to anything else that finds controls by name. */}
      <DialogContent closeLabel={copy.common.close} className="exam-gate-dialog">
        <div className="exam-gate-dialog__art">
          <ExamGateMark variant={improving ? 'improve' : 'start'} />
        </div>

        <DialogHeader>
          <DialogTitle>{improving ? c.improveTitle : c.title}</DialogTitle>
          <DialogDescription>{improving ? c.improveIntro : c.intro}</DialogDescription>
        </DialogHeader>

        <ul className="exam-gate-dialog__points">
          {points.map((point) => (
            <li key={point.title} className="exam-gate-dialog__point">
              <span className="exam-gate-dialog__point-well" aria-hidden="true">
                <point.icon className="size-[1.125rem]" />
              </span>
              <span className="exam-gate-dialog__point-text">
                <strong className="exam-gate-dialog__point-title">{point.title}</strong>
                <span className="exam-gate-dialog__point-body">{point.body}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* The untimed/timed line rides along the bottom of the ORIGINAL
            sitting's list; the improvement list already carries it as its
            third point, so repeating it there would say the same thing twice. */}
        {improving ? (
          <p className="exam-gate-dialog__tail">{c.improveOnceBody}</p>
        ) : (
          <p className="exam-gate-dialog__tail">{timing}</p>
        )}

        {/* Above the footer, so it is between what the student read and the
            button they are about to press again — and `role="alert"` so a
            screen reader announces it without the focus moving. */}
        {error ? (
          <p
            role="alert"
            aria-live="polite"
            className="exam-gate-dialog__tail"
            style={{ color: 'var(--err)' }}
          >
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {c.cancel}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={pending}>
            {improving ? c.improveAgree : c.agree}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
