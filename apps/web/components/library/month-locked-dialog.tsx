'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Ticket } from 'lucide-react';
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
  byMonth = true,
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
  /**
   * `false` on a course that sells no months — where the only way a lecture is
   * locked is that the student holds codes for OTHER lectures. «تابعة لشهر
   * تاني» would name a month that does not exist, so the dialog says what is
   * true instead and sells the course rather than a month.
   */
  byMonth?: boolean;
}) {
  const body = !byMonth
    ? c.lockedContentBody
    : month
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
          <DialogTitle>{byMonth ? c.lockedMonthTitle : c.lockedContentTitle}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          {courseSlug ? (
            /*
              `/courses/:slug/subscribe` and NOT the course page, and that is
              the whole reason this CTA works at all.
 
              The course page sells through `<CourseStartButton>`, which opens
              the panel when `POST /enroll` answers 403 — and the student
              standing in front of this padlock does not get a 403. They own
              «شهر ٢»; they are enrolled; their access is live. The enroll would
              answer 200 and walk them into a lesson, and `proxy.ts` would have
              redirected them to their library before that. A link there is a
              control that returns you to where you pressed it: exactly the dead
              button «الـ٢ بتن دول مش شغالين» named on the exam dialog.
 
              `?month=` is the preselection, so somebody who pressed «الاشتراك
              في الشهر ده» on «شهر ٣» does not then hunt «شهر ٣» in a list of
              nine. Left off when no single month can be named — the picker
              then opens with nothing chosen, which is the right screen for a
              lecture that sits in several months or in one that is closed.
            */
            <Link
              href={`/courses/${encodeURIComponent(courseSlug)}/subscribe${
                month ? `?month=${encodeURIComponent(month.id)}` : ''
              }`}
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
              {byMonth ? c.lockedMonthCta : c.lockedContentCta}
            </Link>
          ) : null}

          {/* «عندك كود؟» — the other way in. A lecture bought on WhatsApp opens
              with a code, and the padlock is exactly where a student holding
              one gets stuck. Same outlined weight as a secondary action. */}
          <Link
            href="/codes"
            className={cn(
              'inline-flex h-10 items-center justify-center gap-1.5 rounded-sm border border-line px-4',
              'text-[length:var(--fs-text-sm)] font-medium text-fg',
              'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
            )}
          >
            <Ticket className="size-4" aria-hidden="true" />
            {copy.unlockCodes.lockedCta}
          </Link>

          <DialogClose asChild>
            <Button variant="secondary">{c.lockedMonthClose}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
