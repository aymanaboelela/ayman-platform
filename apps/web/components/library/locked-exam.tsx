import { copy } from '@ayman/contracts/copy';
import { LockIcon } from '@/components/player/icons';
import type { RemainingLecture } from '@/lib/course-outline';
import { ExamLockedDialog } from './exam-locked-dialog';

const c = copy.library;

/**
 * The locked exam's control on `/library/[slug]`: the grey chip, and the
 * dialog that explains it.
 *
 * This was `<LockedLesson>` and it stood at the end of any locked row. There
 * is one kind of locked row now — the course's final exam — so it is named for
 * it, and the counts it needs are read off the outline it belongs to rather
 * than derived a second time. See `exam-locked-dialog.tsx` for why the dialog
 * lost its «نفتحها دلوقتي» button along the way.
 *
 * No `'use client'` here: everything interactive lives one file over, so this
 * is an ordinary Server Component that picks a shape.
 */
export function LockedExam({
  remaining,
  total,
  left,
  courseSlug,
}: {
  remaining: number;
  total: number;
  /** The lectures still open, by name — see `exam-locked-dialog.tsx`. */
  left?: readonly RemainingLecture[];
  courseSlug?: string;
}) {
  return (
    /* The same `.chip` the «مشاهدة» link wears, in the grey variant, so a list
       of mixed states has one column of controls rather than a ragged one — and
       so nothing shifts when the exam opens. `.chip--locked` also carries
       `cursor: not-allowed`: the EXAM is what is unavailable, and pressing this
       only explains why. */
    <ExamLockedDialog
      remaining={remaining}
      total={total}
      left={left}
      courseSlug={courseSlug}
      triggerClassName="chip chip--locked"
    >
      <LockIcon className="h-4 w-4" />
      {c.lessonLocked}
    </ExamLockedDialog>
  );
}
