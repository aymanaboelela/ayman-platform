'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
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
 * The month a locked lecture belongs to, when the screen can name exactly ONE.
 *
 * `lessonCount` is the month's own published-lecture count — what the money
 * buys — and it comes from `CatalogCourseDetail.months`, never counted on the
 * client off the rows that happen to be drawn.
 */
export interface LockedLessonMonth {
  /** `CourseMonth.id`. Rides into the CTA as `?month=`, which is also what
   *  stops `proxy.ts` bouncing a student who already owns a DIFFERENT month
   *  back to their library — see that file's own note. */
  id: string;
  title: string;
  lessonCount: number;
}

/**
 * WHY this lecture is shut when the one above it opened — the second padlock
 * in the product, and the first one money opens.
 *
 * ## Why this is not a third body on `<ExamLockedDialog>`
 *
 * That dialog's whole shape is an argument about having NOTHING to offer: one
 * control, a dismiss, and deliberately no navigation, because the button it
 * used to carry landed the student on the page they were already looking at.
 * Read its note before touching this one — the two are opposites, and widening
 * it to cover both would mean a dialog whose only control is present for half
 * its callers.
 *
 * This lock is waiting on a payment, not on work. There IS something to press,
 * it is the month's own subscribe route, and it is the entire reason the row
 * draws a padlock a student can tap instead of being hidden.
 *
 * ## The word on the chip is «شهر تاني», not «مقفول»
 *
 * Same reasoning one level up (`copy.library.lessonMonthLocked`): «مقفول» sends
 * a student hunting for the lecture standing in the way, and there isn't one.
 *
 * ⚠️ Nothing here grants or denies anything. `LessonAccessService.require()`
 * re-derives the month check on every request and 403s
 * `needs_month_grant`; this explains a decision, it never makes one.
 */
export function MonthLockedDialog({
  month = null,
  courseSlug,
  children,
  triggerClassName,
  triggerLabel,
}: {
  /**
   * The month to NAME, or `null` to say the true-but-vaguer thing.
   *
   * Filled by `buildCourseOutline` from `CatalogLessonSchema.monthIds` joined
   * against the course's own `months` list, and `null` whenever that join
   * cannot name exactly ONE month the course still offers — the lecture is in
   * none, or in several («اداها كمان لشهر ٣»), or in one that is closed for
   * subscription. All three collapse to the same sentence on purpose: the
   * alternative is picking which month to sell on the instructor's behalf, or
   * pointing a CTA at a month nobody can buy.
   */
  month?: LockedLessonMonth | null;
  /** The course to send them to in order to buy. Omit and the CTA is dropped
   *  rather than rendered dead — see the footer. */
  courseSlug?: string;
  /**
   * What the trigger looks like. Each screen draws its lock in its own
   * vocabulary — a `.chip` at the end of an outline row, a row in the player's
   * sidebar — and forcing one shape on all of them would be a worse fix than
   * the tooltip the exam dialog replaced.
   */
  children: ReactNode;
  triggerClassName?: string;
  /** The trigger's accessible name, when `children` is not readable as one. */
  triggerLabel?: string;
}) {
  const body = month
    ? formatCopy(c.lockedMonthBody, { month: month.title, count: month.lessonCount })
    : c.lockedMonthBodyPlain;

  return (
    <Dialog>
      {/* A real `<button>`, which is what makes the padlock keyboard-focusable
          — see `<ExamLockedDialog>` for the inert `<span>` this replaced. */}
      <DialogTrigger className={triggerClassName} aria-label={triggerLabel}>
        {children}
      </DialogTrigger>

      {/* `common.close` («إغلاق») on the X, never `lockedMonthClose` («مش
          دلوقتي»): two controls sharing one accessible name is the bug
          `exam-gate-dialog.tsx` states the rule about and the exam dialog
          shipped. */}
      <DialogContent closeLabel={copy.common.close}>
        <DialogHeader>
          <DialogTitle>{c.lockedMonthTitle}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          {courseSlug && month ? (
            /*
              The course page is the ONLY route on the platform that sells:
              `<CourseStartButton>` there opens `<SubscribePanel>` on its 403
              branch.

              ⚠️ `?month=` IS LOAD-BEARING, and not only as a preselection.
              `proxy.ts`'s `resolveEnrolledCourseRedirect` 307s `/courses/:slug`
              to `/library/:slug` for any enrollment whose `accessActive` is
              true — and a month grant makes it true, because
              `courseAccessScopes` counts one as access to the course (it has
              to, or that student could not enrol at all). So without this
              parameter a student who owns «شهر ٢» and taps the padlock on a
              «شهر ٣» lecture is returned to the page they pressed it from:
              exactly the dead control «الـ٢ بتن دول مش شغالين» named on the
              exam dialog. The proxy exempts a request that names a month,
              because typing the course URL is "take me to my library" and
              arriving with a month named is a deliberate request to buy one.

              Dropped entirely when the month cannot be named — a bare
              `/courses/:slug` here would be bounced, and a CTA that returns
              you to where you pressed it is worse than no CTA. That student
              reads `lockedMonthBodyPlain` and the dismiss.
            */
            <Link
              href={`/courses/${encodeURIComponent(courseSlug)}?month=${encodeURIComponent(month.id)}`}
              // The same amber solid the library page's «كمّل» link wears —
              // `<Button>` is a real `<button>` with no `asChild`, and a
              // `<button>` that navigates is a control screen readers announce
              // wrong.
              className={cn(
                'inline-flex h-10 items-center justify-center rounded-sm bg-accent px-4',
                'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
                'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
              )}
            >
              {c.lockedMonthCta}
            </Link>
          ) : null}

          <DialogClose asChild>
            <Button variant="secondary">{c.lockedMonthClose}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
