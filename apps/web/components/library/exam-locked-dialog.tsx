'use client';

import type { ReactNode } from 'react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';

const c = copy.library;

/**
 * WHY the final exam is shut, and what is left to do about it — the one
 * implementation, for every screen that draws the padlock.
 *
 * ## It is the only padlock left
 *
 * This was `<LessonLockDialog>`, and it explained any locked lesson: it named
 * the exact lesson standing in the way and offered a link to it. That
 * explanation existed for the sequential chain, and the chain is gone (see
 * `gate-rule.ts`) — every lecture and every lecture quiz opens the day a
 * student enrols. `resolveGate` can now return `locked` for exactly one row in
 * a course, so this dialog has exactly one thing to say.
 *
 * ## The button that went with it
 *
 * «نفتحها دلوقتي» linked to `blockerFor`'s answer — the nearest unfinished
 * lesson ABOVE the locked one. On the player that is, in the ordinary case,
 * the lesson the student is sitting on: they tap the padlock in the sidebar
 * and the dialog offers to take them to the page they are already on. Pressing
 * it navigated to the current URL, so nothing moved and nothing was said.
 * Reported exactly that way — «الـ٢ بتن دول مش شغالين» — and the second button,
 * «تمام», was not broken at all: it closed correctly and still left the student
 * where they started, which reads as the same failure.
 *
 * So, the rule this file is written to: a dialog that explains a block carries
 * no control that lands the student where they already are. What is left is a
 * dismiss, and a sentence holding the only actionable fact — how many lectures
 * remain.
 *
 * ## Why a dialog and not a tooltip or a toast
 *
 * A tooltip is unreachable by touch, which is most of this audience, and cannot
 * hold a count. A toast is dismissible by accident and, on a screen that may
 * already have an overlay up, is either invisible behind it or eaten by it —
 * `exam-gate-dialog.tsx` documents that failure. A dialog is focusable,
 * reachable by keyboard, and dismissible by the back gesture.
 *
 * ⚠️ Nothing here grants or denies access. The gate is re-derived by
 * `/courses/:slug/lessons/:id` on every request, which 404s the locked exam.
 * This explains a decision; it never makes one.
 */
export function ExamLockedDialog({
  remaining,
  total,
  children,
  triggerClassName,
  triggerLabel,
}: {
  /**
   * Lectures still to clear, and how many there are in all.
   *
   * LECTURES, not rows: quizzes are in neither number, and are not in the
   * exam's prerequisite set either (`resolveGate`). Both come from the same
   * cleared/total pair the progress bar on the same screen is drawn from, so
   * the dialog and the bar cannot disagree about what is left.
   *
   * `null` when a screen genuinely does not hold them — the body then states
   * the rule without a count rather than printing a wrong one.
   */
  remaining: number | null;
  total: number | null;
  /**
   * What the trigger looks like. Each screen draws its lock in its own
   * vocabulary — a `.chip` at the end of an outline row, a disc on the path
   * map, a row in the player's sidebar — and forcing one shape on all three
   * would be a worse fix than the tooltip this replaced.
   */
  children: ReactNode;
  triggerClassName?: string;
  /**
   * The trigger's accessible name, when `children` is not already readable as
   * one. The path map's disc is an icon and a title; without this a screen
   * reader announces the title alone and gives no hint that pressing it
   * explains anything.
   */
  triggerLabel?: string;
}) {
  const body =
    remaining !== null && remaining > 0 && total !== null
      ? formatCopy(c.lockedExamBody, { remaining, total })
      : c.lockedExamBodyPlain;

  return (
    <Dialog>
      {/* `DialogTrigger` renders a real `<button>`, which is what makes every
          one of these keyboard-focusable — the thing the inert `<span>` on the
          path map and the `title=` in the player could never be. */}
      <DialogTrigger className={triggerClassName} aria-label={triggerLabel}>
        {children}
      </DialogTrigger>

      {/* ⚠️ `common.close` on the X, NOT `lockedClose`. Both read «تمام»
          before this, so the dialog had TWO controls with one accessible name
          — measured on production: `button "تمام"` twice in the a11y tree.
          `exam-gate-dialog.tsx` states the rule and this dialog broke it. */}
      <DialogContent closeLabel={copy.common.close}>
        <DialogHeader>
          <DialogTitle>{c.lockedExamTitle}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{c.lockedClose}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
