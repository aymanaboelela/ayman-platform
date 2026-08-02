import { copy, type PathCourse } from '@ayman/contracts';
import { cn } from '@ayman/ui';

const c = copy.path;

/**
 * The left column of the reference: the student's courses, each with how far
 * through it they are.
 *
 * A plain `<ul>`, deliberately NOT a `<nav>`. The global header is already the
 * site's navigation landmark, and a second one would make "skip to navigation"
 * ambiguous for a screen-reader user for no gain — these are anchors into the
 * page, not a separate destination set.
 */
export function CourseRail({
  courses,
  currentCourseId,
}: {
  courses: PathCourse[];
  currentCourseId: string | null;
}) {
  return (
    <aside>
      <p className="eyebrow mb-3 text-fg-muted">{c.courses}</p>
      <ul className="overflow-hidden rounded-lg border border-line bg-surface-2">
        {courses.map((course) => {
          const isCurrent = course.id === currentCourseId;
          const isDone = course.totalLessons > 0 && course.clearedLessons === course.totalLessons;

          return (
            <li key={course.id} className="border-b border-line-subtle last:border-b-0">
              <a
                href={`#course-${course.id}`}
                className={cn(
                  'flex items-center gap-3 border-s-2 px-4 py-3',
                  'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
                  isCurrent ? 'border-accent text-fg' : 'border-transparent text-fg-muted',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[length:var(--fs-text-sm)]">
                    {course.title}
                  </span>
                  {isDone ? (
                    <span className="mono block text-[length:var(--fs-mono-label)] text-accent-text">
                      {c.courseDone}
                    </span>
                  ) : null}
                </span>
                <span className="mono tabular shrink-0 text-[length:var(--fs-mono-label)] text-fg-muted">
                  {course.clearedLessons}/{course.totalLessons}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
