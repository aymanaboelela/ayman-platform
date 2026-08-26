import Link from 'next/link';
import { copy, type EnrolledCourse } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { enrolledCourseHref } from '@/lib/course-href';
import { subscriptionExpiryLabel } from '@/lib/subscription-expiry';
import { CourseArt } from '@/components/course-art';

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
 */
export function EnrolledCourseCard({ course }: { course: EnrolledCourse }) {
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

  const done = course.progressPercent >= 100;
  const cta = done
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
                without borrowing its wording. */}
            <span className={cn('chip', closed ? 'chip--locked' : done ? 'chip--done' : 'chip--solid')}>
              {closed ? copy.path.closedBadge : done ? copy.dashboard.courseDone : cta}
            </span>
          </div>

          {/* Only a paid subscription with a live term ever has anything to
              say here — see `subscriptionExpiryLabel`. */}
          {expiry ? (
            <p className="text-[length:var(--fs-mono-label)] text-fg-muted">{expiry}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
