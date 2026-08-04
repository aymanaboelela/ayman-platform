'use client';

import Link from 'next/link';
import { copy } from '@ayman/contracts';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  cn,
} from '@ayman/ui';
import { LockIcon } from '@/components/player/icons';
import type { OutlineLesson } from '@/lib/course-outline';

const c = copy.library;

/**
 * A locked lesson, and the dialog that explains WHY when a student presses it.
 *
 * ## Why a dialog and not a tooltip or a dead padlock
 *
 * A dead padlock is what this replaces: no explanation, and a student left to
 * guess whether the lesson is unreleased, paid for, or waiting on something
 * they think they already did. The one question they have — "what do I have to
 * finish first?" — has an exact answer the server already computed, so this
 * says it by name and offers to take them straight there.
 *
 * A tooltip cannot do the job: it is unreachable by touch, which is most of
 * this audience, and it cannot hold the link.
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
 */
export function LockedLesson({
  lesson,
  courseSlug,
}: {
  lesson: OutlineLesson;
  courseSlug: string;
}) {
  const blocker = lesson.blockedBy;

  const body = lesson.isExam
    ? c.lockedExam
    : blocker
      ? (blocker.kind === 'quiz' ? c.lockedBecauseQuiz : c.lockedBecause).replace(
          '{lesson}',
          blocker.title,
        )
      : c.lockedGeneric;

  return (
    <Dialog>
      {/* The same `.chip` the «مشاهدة» link wears, in the grey variant, so a
          list of mixed states has one column of controls rather than a ragged
          one — and so nothing shifts as lessons unlock. `.chip--locked` also
          carries `cursor: not-allowed`: the LESSON is what is unavailable, and
          pressing this only explains why. */}
      <DialogTrigger className="chip chip--locked">
        <LockIcon className="h-4 w-4" />
        {c.lessonLocked}
      </DialogTrigger>

      <DialogContent closeLabel={c.lockedClose}>
        <DialogHeader>
          <DialogTitle>{c.lockedTitle}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {blocker ? (
            <Link
              href={`/courses/${courseSlug}/lessons/${blocker.id}`}
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
