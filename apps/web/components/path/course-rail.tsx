import { copy, type PathCourse } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { CheckIcon } from '@/components/player/icons';
import { ProgressRing } from './progress-ring';

const c = copy.path;

/**
 * The student's courses down the inline start, each with how far through it
 * they are — the column the map jumps from.
 *
 * A plain `<ul>`, deliberately NOT a `<nav>`. The global header is already the
 * site's navigation landmark, and a second one would make "skip to navigation"
 * ambiguous for a screen-reader user for no gain — these are anchors into the
 * page, not a separate destination set.
 *
 * ## The ring is the icon
 *
 * The reference this is modelled on gives every course a little pictogram. This
 * platform has no per-course artwork and no field to hang one on, so the
 * options were an arbitrary glyph or none — and an arbitrary glyph is worse
 * than none, because a student will reasonably try to read meaning into it and
 * there is none to read. What sits in that slot instead is the course's own
 * progress, as a ring with its number in the middle: the same visual weight the
 * reference gets from a pictogram, spent on a fact.
 */
export function CourseRail({
  courses,
  currentCourseId,
}: {
  courses: PathCourse[];
  currentCourseId: string | null;
}) {
  return (
    <aside className="lg:sticky lg:top-6 lg:self-start">
      <p className="eyebrow mb-3 text-fg-muted">{c.courses}</p>
      <ul className="panel overflow-hidden">
        {courses.map((course, index) => {
          const isCurrent = course.id === currentCourseId;
          const isDone = course.totalLessons > 0 && course.clearedLessons === course.totalLessons;

          return (
            <li key={course.id} className="border-b border-line-subtle last:border-b-0">
              <a
                href={`#course-${course.id}`}
                className={cn(
                  'flex items-center gap-3 border-s-2 px-3 py-3',
                  'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
                  isCurrent ? 'border-accent text-fg' : 'border-transparent text-fg-muted',
                )}
              >
                <ProgressRing percent={course.progressPercent} size={36}>
                  {isDone ? (
                    <CheckIcon className="h-3.5 w-3.5 text-accent-text" />
                  ) : (
                    <span className="mono tabular text-[length:var(--fs-mono-label)] text-accent-text">
                      {index + 1}
                    </span>
                  )}
                </ProgressRing>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[length:var(--fs-text-sm)]">
                    {course.title}
                  </span>
                  <span className="mono block text-[length:var(--fs-mono-label)] text-fg-muted">
                    {isDone ? c.courseDone : `${course.clearedLessons} / ${course.totalLessons}`}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
