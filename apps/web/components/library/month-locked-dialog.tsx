'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CalendarPlus, PlayCircle, Ticket } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import './locked-dialog.css';

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
      <DialogContent closeLabel={copy.common.close} className="lock-dialog">
        {/* The band on top is the picture the old dialog did not have: three
            lines of grey text and three buttons that wrapped onto two rows at
            phone width read as an error, not as «ده شهر تاني وده مكانه». */}
        <div className="lock-dialog__band" aria-hidden="true">
          <LockedMonthArt />
        </div>

        <DialogHeader className="lock-dialog__head">
          <DialogTitle className="lock-dialog__title">
            {byMonth ? c.lockedMonthTitle : c.lockedContentTitle}
          </DialogTitle>
          <DialogDescription className="lock-dialog__body">{body}</DialogDescription>
        </DialogHeader>

        {byMonth && month ? (
          <p className="lock-dialog__month">
            <span className="lock-dialog__month-name">{month.title}</span>
            <span className="lock-dialog__month-count">
              <PlayCircle className="size-3.5" aria-hidden="true" />
              {month.lessonCount > 0
                ? formatCopy(copy.subscribe.monthCardLessons, { count: month.lessonCount })
                : copy.subscribe.monthCardEmpty}
            </span>
          </p>
        ) : null}

        {/* Stacked, never a row. Three controls side by side do not fit 360px
            in Arabic, and a flex row that wraps drops the dismiss under the
            checkout at a different width on every phone. One full-width
            action, then the two quiet ones sharing a line. */}
        <div className="lock-dialog__actions">
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
              // A link, not `<Button>`: `<Button>` is a real `<button>` with no
              // `asChild`, and a `<button>` that navigates is a control screen
              // readers announce wrong.
              className="lock-dialog__cta"
            >
              <CalendarPlus className="size-[18px]" aria-hidden="true" />
              {byMonth ? c.lockedMonthCta : c.lockedContentCta}
            </Link>
          ) : null}

          <div className="lock-dialog__row">
            {/* «عندك كود؟» — the other way in. A lecture bought on WhatsApp
                opens with a code, and the padlock is exactly where a student
                holding one gets stuck. */}
            <Link href="/codes" className="lock-dialog__alt">
              <Ticket className="size-4" aria-hidden="true" />
              {copy.unlockCodes.lockedCta}
            </Link>

            <DialogClose className="lock-dialog__alt lock-dialog__alt--quiet">
              {c.lockedMonthClose}
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A calendar page with the next month's number on it and a padlock hanging off
 * its corner — «ده شهر تاني» said as a picture before it is read. Colours are
 * classes, so both themes and every tenant's hue come from the tokens.
 */
function LockedMonthArt() {
  return (
    <svg className="lock-dialog__art" viewBox="0 0 160 112" focusable="false">
      <ellipse cx="80" cy="102" rx="54" ry="6" className="lock-art__shadow" />
      {/* the page behind — last month, already open */}
      <g transform="rotate(-8 58 60)">
        <rect x="26" y="26" width="64" height="66" rx="10" className="lock-art__page lock-art__page--back" />
        <rect x="26" y="26" width="64" height="16" rx="8" className="lock-art__ring lock-art__ring--back" />
        <path d="M44 66 l8 8 l16 -18" className="lock-art__tick" />
      </g>
      {/* the page in front — the month this lecture sits in */}
      <g transform="rotate(6 100 58)">
        <rect x="66" y="20" width="68" height="72" rx="11" className="lock-art__page" />
        <rect x="66" y="20" width="68" height="18" rx="9" className="lock-art__ring" />
        <rect x="66" y="30" width="68" height="8" className="lock-art__ring" />
        <circle cx="82" cy="20" r="3.5" className="lock-art__hole" />
        <circle cx="118" cy="20" r="3.5" className="lock-art__hole" />
        <rect x="78" y="48" width="10" height="8" rx="2" className="lock-art__day" />
        <rect x="95" y="48" width="10" height="8" rx="2" className="lock-art__day" />
        <rect x="112" y="48" width="10" height="8" rx="2" className="lock-art__day" />
        <rect x="78" y="62" width="10" height="8" rx="2" className="lock-art__day" />
        <rect x="95" y="62" width="10" height="8" rx="2" className="lock-art__day lock-art__day--on" />
        <rect x="112" y="62" width="10" height="8" rx="2" className="lock-art__day" />
      </g>
      {/* the padlock */}
      <g transform="translate(112 58)">
        <path d="M6 14 v-6 a10 10 0 0 1 20 0 v6" className="lock-art__shackle" />
        <rect x="0" y="13" width="32" height="26" rx="7" className="lock-art__body" />
        <circle cx="16" cy="24" r="3.5" className="lock-art__key" />
        <rect x="14.5" y="25" width="3" height="7" rx="1.5" className="lock-art__key" />
      </g>
      <circle cx="30" cy="18" r="3" className="lock-art__spark" />
      <circle cx="144" cy="30" r="2.5" className="lock-art__spark lock-art__spark--b" />
      <path d="M140 92 l3 -6 l3 6 l-3 6 z" className="lock-art__spark" />
    </svg>
  );
}
