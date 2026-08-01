import Link from 'next/link';
import { copy, type EnrolledCourse } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { ChevronForward } from '@/components/player/icons';
import { LessonProgressBar } from '@/components/player/lesson-progress-bar';

/**
 * One enrolled course: title, progress, and where the next click goes.
 *
 * The CTA's wording is derived from progress rather than fixed — "ابدأ" for an
 * untouched course, "كمّل" once there is something to return to, and a done
 * state at 100%. A single "افتح الكورس" on every card makes a finished course
 * and an unstarted one look like the same object.
 */
export function EnrolledCourseCard({ course }: { course: EnrolledCourse }) {
  // Resume where they stopped when we know, otherwise the course page picks
  // the first lesson — never a dead link either way.
  const href = course.lastLessonId
    ? `/courses/${course.slug}/lessons/${course.lastLessonId}`
    : `/courses/${course.slug}`;

  const done = course.progressPercent >= 100;
  const cta = done
    ? copy.dashboard.openCourse
    : course.progressPercent > 0
      ? copy.dashboard.continueCourse
      : copy.dashboard.startCourse;

  return (
    <article
      className={cn(
        'relative isolate flex flex-col gap-4 rounded-lg border border-line bg-surface-2 p-5',
        'transition-colors duration-[160ms] ease-out hover:border-line-strong',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[length:var(--fs-title-4)] font-medium text-fg">
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
        <p className="mono tabular text-[length:var(--fs-mono-label)] text-fg-muted">
          {course.completedLessons} {copy.dashboard.lessonsOf} {course.totalLessons}{' '}
          {copy.dashboard.lessonsWord}
        </p>

        <span className="inline-flex items-center gap-1 text-[length:var(--fs-text-sm)] font-medium text-accent-text">
          {done ? copy.dashboard.courseDone : cta}
          <ChevronForward />
        </span>
      </div>
    </article>
  );
}
