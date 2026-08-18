'use client';

import type { ReactNode } from 'react';
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

const c = copy.path;

/**
 * «الكورس ده مقفول مؤقتاً» — what a stop says when the course around it has
 * been unpublished.
 *
 * ## Why this is not `<ExamLockedDialog>`
 *
 * They look alike and they mean opposite things, which is exactly why they are
 * two components. The locked EXAM is a statement about the student: you have
 * not finished the course yet, and here is how much of it is left. A closed
 * COURSE is a statement about the course: the instructor is editing it,
 * nothing you did caused this, and nothing you can do will change it.
 *
 * Folding them together would mean one dialog whose body sometimes counts down
 * to something the student can reach and sometimes cannot — and the version
 * that cannot is the one that most needs to say why, in its own words. So this
 * has no count and no destination, and does not pretend to: no «حاول تاني». A
 * retry that cannot succeed is worse than no button.
 *
 * ⚠️ This explains a refusal; it does not make one. `LessonAccessService`
 * refuses an unpublished course on every request regardless of what is drawn
 * here — see `PathCourseSchema.published`.
 */
export function CourseClosedDialog({
  children,
  triggerClassName,
  triggerLabel,
}: {
  children: ReactNode;
  triggerClassName?: string;
  /** The trigger's accessible name when `children` is icons and a title. */
  triggerLabel?: string;
}) {
  return (
    <Dialog>
      {/* A real `<button>`, which is the point: the stop it replaces was an
          inert `<span>` that could not be focused, could not be pressed, and
          said nothing. */}
      <DialogTrigger className={triggerClassName} aria-label={triggerLabel}>
        {children}
      </DialogTrigger>

      {/* `common.close` on the X — the footer already owns «تمام». Same rule
          as `exam-locked-dialog.tsx`. */}
      <DialogContent closeLabel={copy.common.close}>
        <DialogHeader>
          <DialogTitle>{c.closedTitle}</DialogTitle>
          <DialogDescription>{c.closedBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{c.closedClose}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
