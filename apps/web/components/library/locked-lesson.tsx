import { copy } from '@ayman/contracts/copy';
import { LockIcon } from '@/components/player/icons';
import type { OutlineLesson } from '@/lib/course-outline';
import { LessonLockDialog } from './lesson-lock-dialog';

const c = copy.library;

/**
 * The locked row's control on `/library/[slug]`: the grey chip, and the dialog
 * that explains it.
 *
 * The dialog itself moved to `<LessonLockDialog>` when the learning path and
 * the player's sidebar became the second and third screens that needed it —
 * this is now only the chip. See that file for why one shared explanation
 * exists at all, and `blockerFor` in `lib/course-outline.ts` for the shared
 * derivation behind it.
 *
 * No `'use client'` here any more: everything interactive lives one file over,
 * so this is an ordinary Server Component that picks a shape.
 */
export function LockedLesson({
  lesson,
  courseSlug,
}: {
  lesson: OutlineLesson;
  courseSlug: string;
}) {
  return (
    /* The same `.chip` the «مشاهدة» link wears, in the grey variant, so a list
       of mixed states has one column of controls rather than a ragged one — and
       so nothing shifts as lessons unlock. `.chip--locked` also carries
       `cursor: not-allowed`: the LESSON is what is unavailable, and pressing
       this only explains why. */
    <LessonLockDialog
      blockedBy={lesson.blockedBy}
      isExam={lesson.isExam}
      courseSlug={courseSlug}
      triggerClassName="chip chip--locked"
    >
      <LockIcon className="h-4 w-4" />
      {c.lessonLocked}
    </LessonLockDialog>
  );
}
