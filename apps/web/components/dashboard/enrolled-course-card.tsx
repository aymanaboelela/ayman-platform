import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { copy, type EnrolledCourse } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { enrolledCourseHref } from '@/lib/course-href';
import { LessonProgressBar } from '@/components/player/lesson-progress-bar';

/**
 * One enrolled course: title, progress, and where the next click goes.
 *
 * The CTA's wording is derived from progress rather than fixed — "ابدأ" for an
 * untouched course, "كمّل" once there is something to return to, and a done
 * state at 100%. A single "افتح الكورس" on every card makes a finished course
 * and an unstarted one look like the same object.
 *
 * ## No cover here, deliberately
 *
 * `LibraryCourseCard` opens on the course's artwork; this one cannot.
 * `EnrolledCourseSchema` (`packages/contracts/src/progress.ts`) carries id,
 * slug, title, progress and counts — there is no `coverKey` on it, and the
 * dashboard endpoint does not join the catalog to get one. Inventing a field
 * would mean a second round trip on the one screen that has to paint fastest.
 * What the card gets instead is a violet kind-well: the same object the lesson
 * rows use to say "this is a course", at a size that gives the card a shape
 * without pretending to be a photograph.
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
        'panel relative isolate flex flex-col gap-4 p-5',
        'transition-colors duration-[160ms] ease-out',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-md bg-study-tint text-study"
        >
          <BookOpen className="size-5" />
        </span>

        <h3 className="min-w-0 flex-1 text-[length:var(--fs-title-4)] font-medium text-fg">
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {course.title}
          </Link>
        </h3>

        <span className="mono tabular shrink-0 text-[length:var(--fs-mono-label)] text-accent-text">
          {Math.round(course.progressPercent)}%
        </span>
      </div>

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
    </article>
  );
}
