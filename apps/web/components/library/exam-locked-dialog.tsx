'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import type { RemainingLecture } from '@/lib/course-outline';
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
  left = [],
  courseSlug,
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
   * WHICH lectures are still open, in course order.
   *
   * This file used to argue that the count was enough. It is not: «متسيبش حاجة
   * مشفتهاش» — a student with three lectures outstanding in a forty-row outline
   * can read «باقي ٣» and still not know where they are. So the count stays
   * (it is the headline) and the names sit under it, each one a link.
   *
   * This does NOT reintroduce the «نفتحها دلوقتي» button this dialog lost. That
   * button offered ONE destination, computed to be the nearest unfinished
   * lesson above — which on the player is the page the student is already on,
   * so pressing it did nothing. These are every remaining lecture, by name, and
   * none of them is the row that opened the dialog.
   *
   * Empty (the default) → the dialog is exactly what it was: a count and a
   * dismiss. That is the honest shape for a screen that does not hold the list.
   */
  left?: readonly RemainingLecture[];
  /** Only needed to build the lesson links; omit it and the names render flat. */
  courseSlug?: string;
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

  // Long courses: the point is to name what is left, not to reprint the
  // outline the student is already looking at. Past this many the dialog says
  // how many more there are and lets the page itself do the rest.
  const shown = left.slice(0, 8);
  const hidden = left.length - shown.length;

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

        {shown.length > 0 ? (
          <div className="mt-2">
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.lockedExamLeftTitle}</p>
            <ul className="mt-2 space-y-1">
              {shown.map((lecture) => {
                const meta = [
                  c.lessonIndex.replace('{n}', String(lecture.index)),
                  lecture.started ? c.lessonStarted : c.lessonNew,
                ].join(' · ');
                // A link only when the screen knows the course it is on. The
                // player's sidebar does; a card that only holds counts does
                // not, and a dead `<a>` is worse than a line of text.
                const row = (
                  <>
                    <span className="block truncate text-fg">{lecture.title}</span>
                    <span className="mono block text-[length:var(--fs-mono-label)] text-fg-muted">
                      {meta}
                    </span>
                  </>
                );
                return (
                  <li key={lecture.id}>
                    {courseSlug ? (
                      <Link
                        href={`/courses/${courseSlug}/lessons/${lecture.id}`}
                        className="block rounded-[var(--r-md)] border border-line-subtle bg-surface-2 px-3 py-2 transition-colors hover:border-line-strong hover:bg-surface-3"
                      >
                        {row}
                      </Link>
                    ) : (
                      <div className="rounded-[var(--r-md)] border border-line-subtle bg-surface-2 px-3 py-2">
                        {row}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {hidden > 0 ? (
              <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg-muted">
                {c.lockedExamLeftMore.replace('{n}', String(hidden))}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{c.lockedClose}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
