import Link from 'next/link';
import { copy, type EnrolledCourse } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { enrolledCourseHref } from '@/lib/course-href';
import { subscriptionExpiryLabel } from '@/lib/subscription-expiry';
import { CourseArt } from '@/components/course-art';
import { BookOrderButton } from '@/components/site/book-order-button';
import { courseBookCtaVisible } from '@/lib/course-book';

import { LessonProgressBar } from '@/components/player/lesson-progress-bar';

/**
 * One enrolled course: title, progress, and where the next click goes.
 *
 * The CTA's wording is derived from progress rather than fixed — "ابدأ" for an
 * untouched course, "نكمّل" once there is something to return to, and a done
 * state at 100%. A single "فتح الكورس" on every card makes a finished course
 * and an unstarted one look like the same object.
 *
 * ## The art
 *
 * `<CourseArt>`, the same object the library card and the in-shell course page
 * render. The three used to hold three copies of "cover, or else a grey panel",
 * which is how the same course ended up with an ember glyph on one screen and
 * an amber one on another.
 *
 * The panel is 16/7 — deliberately shallower than the library's 16/8 and the
 * course page's 16/10. This card carries a title, a meter, a count AND a
 * button; at 16/8 the art was more than half of it, which is what made four of
 * them read as wallpaper with some text under it.
 *
 * ## The CTA
 *
 * A real `.chip`, not a word with a chevron after it. The whole card is still
 * one link — the title's stretched `::after` owns the hit area, so there is
 * exactly one accessible name — but the chip is what tells a student, in the
 * same amber they have learned means "press this" everywhere else, that there
 * is somewhere to go. A finished course swaps it for `.chip--done`, because
 * green is completion's colour and a completed course is not an action.
 *
 * ## The book CTA
 *
 * «اطلب الكتاب» used to be reachable only from the PUBLIC course page
 * (`(site)/courses/[slug]`) — a student who enrolled and never goes back
 * there had no way to discover or use it at all. `courseBookCtaVisible` is the
 * same gate that page applies — a title and a price to print, and the linked
 * catalogue row's `showOnCourse` allowed to take the button away;
 * `BookOrderButton` is the exact same component, dialog and API calls, just
 * triggered from a second surface.
 *
 * It sits in its own `relative z-10` wrapper, not bare in the footer: the
 * card's title carries the ONE stretched link that makes the whole panel
 * clickable (`after:absolute after:inset-0` on the `<Link>` above), and
 * without a higher stacking context a tap on this button would hit that
 * overlay first and navigate into the course instead of opening the dialog.
 */
export function EnrolledCourseCard({
  course,
  shippingCents,
  vodafoneCash,
}: {
  course: EnrolledCourse;
  /** The delivery fee, from `getBookShippingCents()` — see `BookOrderButton`. */
  shippingCents: number;
  /** `contact.vodafoneCash`, E.164 or `null` — same prop `BookOrderButton`
   *  takes on the public course page. */
  vodafoneCash: string | null;
}) {
  // Shared with the rail's «كورساتي» list — see `lib/course-href.ts`. The
  // local copy this replaced fell back to the PUBLIC course page, so a student
  // who had enrolled but not opened a lesson yet was shown a lock.
  const href = enrolledCourseHref(course);

  /*
    The instructor has taken this course down to edit it.

    The card used to be unreachable in this state because the API dropped the
    course from the payload outright — so it vanished off «كورساتي» with no
    word, while `/path` kept drawing the same course as a run of links that
    every one 404'd. Both screens say «مقفول مؤقتاً» now.

    Nothing here links: `enrolledCourseHref` resolves to `/library/{slug}` once
    `lastLessonId` is nulled, and that page reads the published-only catalog and
    answers `notFound()`. The card keeps its art, its title, its meter and its
    count — the student's work is all still true — and swaps only the parts that
    would have gone somewhere.
  */
  const closed = !course.published;

  /*
    Zero real lectures published yet — same `totalLessons` `DashboardService`
    already computes with the `kind != 'quiz'` rule (`isComingSoon` in
    `catalog.ts`). Mirrors `LibraryCourseCard`'s own `empty` case: a card that
    says «ابدأ» over a course with nothing to start is a promise the next
    click breaks, and the honest chip is two words rather than a lie in
    amber. The card still links — `enrolledCourseHref` resolves to
    `/library/{slug}`, which explains the state properly — this only stops
    the CTA claiming there is something to press right now.
  */
  const comingSoon = !closed && course.totalLessons === 0;

  // Title, price and placement — the one predicate the public course page and
  // the player outline read too, so «شيلت الكتاب من صفحات الكورسات» takes the
  // button off all three at once. Also hidden while `closed`, which is this
  // screen's own extra rule: `BookOrdersService.create` 404s on anything but a
  // PUBLISHED course, so a button here on a taken-down course would only ever
  // fail.
  const hasBook = courseBookCtaVisible(course);
  const showBookCta = hasBook && !closed;

  const done = course.progressPercent >= 100;
  const cta = comingSoon
    ? copy.course.comingSoonBadge
    : done
      ? copy.dashboard.openCourse
      : course.progressPercent > 0
        ? copy.dashboard.continueCourse
        : copy.dashboard.startCourse;

  // `null` on a free or admin-granted course, or once the term has already
  // lapsed — see `subscriptionExpiryLabel`'s own note on why a lapsed grant
  // says nothing here rather than a second, possibly stale "expired". A
  // fresh `Date` at render time is safe on a SERVER component rendered once
  // per request; it is `notification-view.ts`'s CLIENT components that must
  // never read the clock mid-render.
  const expiry = subscriptionExpiryLabel(course.subscriptionValidUntil, new Date());

  return (
    <article
      className={cn(
        'panel relative isolate flex flex-col overflow-hidden',
        'transition-colors duration-[160ms] ease-out',
        'hover:border-[color:var(--border-strong)]',
      )}
    >
      {/*
        The aspect box exists ONLY for the cover-less fallback.

        `<CourseArt>`'s generated scene is a gradient panel with no intrinsic
        height, so without a box it collapses to nothing — it genuinely needs
        the 16/7. An uploaded cover is the opposite case: it brings its own
        height, and forcing it into 16/7 is what was cutting a third off it.
        So the box is conditional on which of the two is about to render.
      */}
      <div
        className={cn(
          'relative shrink-0 overflow-hidden',
          course.coverKey ? null : 'aspect-[16/7]',
        )}
      >
        <CourseArt
          coverKey={course.coverKey}
          subjectNameAr={course.subjectNameAr}
          seed={course.slug}
        />

        {/* The progress figure rides ON the artwork rather than beside the
            title, so the number a returning student is looking for is the
            first thing on the card instead of the fourth. */}
        <span className="course-cover__badge mono tabular">
          {Math.round(course.progressPercent)}%
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <h3 className="min-w-0 text-[length:var(--fs-title-4)] font-medium text-fg">
          {closed ? (
            course.title
          ) : (
            <Link href={href} className="after:absolute after:inset-0 after:content-['']">
              {course.title}
            </Link>
          )}
        </h3>

        {/* `mt-auto` on the footer block, so the meter and the button line up
            across a row of cards whose titles wrap to different heights. */}
        <div className="mt-auto flex flex-col gap-4">
          <LessonProgressBar percent={course.progressPercent} label={copy.dashboard.progressLabel} />

          <div className="flex items-center justify-between gap-3">
            <p className="mono tabular min-w-0 truncate text-[length:var(--fs-mono-label)] text-fg-muted">
              {course.completedLessons} {copy.dashboard.lessonsOf} {course.totalLessons}{' '}
              {copy.dashboard.lessonsWord}
            </p>

            {/* `.chip--locked` — the grey, `cursor: not-allowed` variant every
                blocked control in the study surface already wears, so a closed
                course reads as the same KIND of thing as a locked lesson
                without borrowing its wording. `.chip--quiet` for the coming-
                soon state — same reasoning as `LibraryCourseCard`'s `empty`
                branch: it is not the thing to press right now, so it does not
                wear the amber that means "press this". */}
            <span
              className={cn(
                'chip',
                closed
                  ? 'chip--locked'
                  : comingSoon
                    ? 'chip--quiet'
                    : done
                      ? 'chip--done'
                      : 'chip--solid',
              )}
            >
              {closed
                ? copy.path.closedBadge
                : done
                  ? course.contentComplete
                    ? copy.dashboard.courseDone
                    : copy.dashboard.courseUpToDate
                  : cta}
            </span>
          </div>

          {/* Only a paid subscription with a live term ever has anything to
              say here — see `subscriptionExpiryLabel`. */}
          {expiry ? (
            <p className="text-[length:var(--fs-mono-label)] text-fg-muted">{expiry}</p>
          ) : null}

          {/* `relative z-10`, not bare — see the docblock above on why a
              plain button here would lose its click to the title's stretched
              link. A SEPARATE action from «نكمّل»/«ابدأ», never merged into
              it: continuing the course and ordering its book are two
              different things a student presses for two different reasons. */}
          {showBookCta ? (
            <div className="enrolled-course-card__book relative z-10">
              <BookOrderButton
                courseId={course.id}
                bookTitle={course.bookTitle as string}
                bookPriceCents={course.bookPriceCents as number}
                shippingCents={shippingCents}
                vodafoneCash={vodafoneCash}
              />
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
