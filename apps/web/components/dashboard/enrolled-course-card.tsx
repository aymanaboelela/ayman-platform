import Link from 'next/link';
import { copy, type EnrolledCourse } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { enrolledCourseHref } from '@/lib/course-href';
import { CourseArt } from '@/components/course-art';

import { LessonProgressBar } from '@/components/player/lesson-progress-bar';

/**
 * One enrolled course: title, progress, and where the next click goes.
 *
 * The CTA's wording is derived from progress rather than fixed — "ابدأ" for an
 * untouched course, "كمّل" once there is something to return to, and a done
 * state at 100%. A single "افتح الكورس" on every card makes a finished course
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

  const done = course.progressPercent >= 100;
  const cta = done
    ? copy.dashboard.openCourse
    : course.progressPercent > 0
      ? copy.dashboard.continueCourse
      : copy.dashboard.startCourse;

  return (
    <article
      className={cn(
        'panel relative isolate flex flex-col overflow-hidden',
        'transition-colors duration-[160ms] ease-out',
        'hover:border-[color:var(--border-strong)]',
      )}
    >
      <div className="relative aspect-[16/7] shrink-0 overflow-hidden">
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
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {course.title}
          </Link>
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

            <span className={cn('chip', done ? 'chip--done' : 'chip--solid')}>
              {done ? copy.dashboard.courseDone : cta}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
