'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { copy } from '@ayman/contracts/copy';
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
import { cn } from '@ayman/ui/lib/cn';
import type { OutlineLesson } from '@/lib/course-outline';

const c = copy.library;

/**
 * WHY a lesson is locked, and what to do about it — the one implementation,
 * for every screen that draws a padlock.
 *
 * ## Why this was extracted
 *
 * Three screens drew a lock and they said three different amounts:
 *
 *   · `/library/[slug]` — this dialog. It names the exact lesson standing in
 *     the way and offers to go there.
 *   · `/path` — an inert `<span aria-disabled className="cursor-not-allowed">`.
 *     Pressing it did NOTHING: no message, no focus, no reason, no way
 *     forward. A student who taps the one obviously-blocked thing on their own
 *     learning map and gets no response at all concludes the site is broken,
 *     and they are not being unreasonable.
 *   · the player's sidebar — a native `title=` tooltip, which does not exist on
 *     a touch screen. That is most of this audience.
 *
 * All three already hold the same `PathNode[]`, so all three can name the same
 * blocker: `blockerFor` in `lib/course-outline.ts` is the shared derivation and
 * this is the shared explanation. «مش عايز إن هو يضغط على حاجة وما يبقاش ليه
 * استجابة».
 *
 * ## Why a dialog and not a tooltip or a toast
 *
 * A tooltip is unreachable by touch and cannot hold a link. A toast is
 * dismissible by accident and, on a screen that may already have an overlay
 * up, is either invisible behind it or eaten by it — `exam-gate-dialog.tsx`
 * documents that failure. A dialog is focusable, reachable by keyboard,
 * dismissible by the back gesture, and it can carry the one control that
 * matters: the way to the thing that is actually blocking them.
 *
 * ## The three messages
 *
 *   · a quiz stands in the way → «لازم تنجح في …» — passing, not watching,
 *     because `cleared` for a quiz means `passed`
 *   · any other lesson → «لازم تخلّص …»
 *   · the exam → no single blocker exists (`resolveGate` rule 3: it opens only
 *     when every OTHER lesson is cleared), so it says "finish the course"
 *     rather than pointing at an arbitrary lesson
 *
 * ⚠️ Nothing here grants or denies access. The gate is re-derived by
 * `/courses/:slug/lessons/:id` on every request, which 404s a locked lesson.
 * This explains a decision; it never makes one.
 */
export function LessonLockDialog({
  blockedBy,
  isExam,
  courseSlug,
  children,
  triggerClassName,
  triggerLabel,
}: {
  /** The lesson in the way, from `blockerFor`. `null` for the exam. */
  blockedBy: OutlineLesson['blockedBy'];
  isExam: boolean;
  courseSlug: string;
  /**
   * What the trigger looks like. Each screen draws its lock in its own
   * vocabulary — a `.chip` at the end of an outline row, a disc on the path
   * map, a row in the player's sidebar — and forcing one shape on all three
   * would be a worse fix than the tooltip it replaces.
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
  const body = isExam
    ? c.lockedExam
    : blockedBy
      ? (blockedBy.kind === 'quiz' ? c.lockedBecauseQuiz : c.lockedBecause).replace(
          '{lesson}',
          blockedBy.title,
        )
      : c.lockedGeneric;

  return (
    <Dialog>
      {/* `DialogTrigger` renders a real `<button>`, which is what makes every
          one of these keyboard-focusable — the thing the inert `<span>` on the
          path map and the `title=` in the player could never be. */}
      <DialogTrigger className={triggerClassName} aria-label={triggerLabel}>
        {children}
      </DialogTrigger>

      <DialogContent closeLabel={c.lockedClose}>
        <DialogHeader>
          <DialogTitle>{c.lockedTitle}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {blockedBy ? (
            <Link
              href={`/courses/${courseSlug}/lessons/${blockedBy.id}`}
              className={cn(
                'inline-flex h-10 items-center justify-center rounded-sm bg-accent px-4',
                'text-[length:var(--fs-text-base)] font-medium text-[#1A1206]',
                'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
              )}
            >
              {c.lockedGo}
            </Link>
          ) : null}
          <DialogClose asChild>
            <Button variant="secondary">{c.lockedClose}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
