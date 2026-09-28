import type { CSSProperties } from 'react';
import { copy, type PathCourse } from '@ayman/contracts';
import { SubjectMark } from '@/components/course-art';
import { CheckIcon } from '@/components/player/icons';
import { ProgressRing } from '@/components/progress-ring';
import { PATH_HUES } from './path-hues';

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
 * ## The ring, and the pictogram inside it
 *
 * This used to carry the course's INDEX in the middle of the ring, above a note
 * explaining that the reference gives every course a little pictogram, that
 * "this platform has no per-course artwork and no field to hang one on", and
 * that an arbitrary glyph is worse than none because a student will try to read
 * meaning into it and find none.
 *
 * Both halves of that are now false. `subjectNameAr` is on the payload, and the
 * glyph is not arbitrary: it is the SUBJECT's, in the subject's hue, and it is
 * the same mark the course wears on the dashboard and in the library. So a
 * student can learn it — which is the exact bar the old note set and could not
 * meet.
 *
 * The index it replaced was the weakest thing that could have been in that
 * slot: the rail is already an ordered list, so the number restated the row's
 * own position and said nothing about the course. The ring around it still
 * carries progress, and a finished course still swaps the mark for a check.
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
      {/* كل كورس بلونه (`data-hue`) — نفس اللون اللي راسه ومحطاته واخدينه تحت،
          فالعين بتربط الصف هنا بالخريطة هناك من غير ما تقرا العنوان مرتين. */}
      <ul className="pth-rail">
        {courses.map((course, index) => {
          const isCurrent = course.id === currentCourseId;
          const isDone = course.totalLessons > 0 && course.clearedLessons === course.totalLessons;

          return (
            <li key={course.id} data-hue={index % PATH_HUES}>
              <a
                href={`#course-${course.id}`}
                className="pth-rail__item"
                data-current={isCurrent || undefined}
                aria-current={isCurrent ? 'true' : undefined}
              >
                <ProgressRing percent={course.progressPercent} size={44}>
                  {isDone ? (
                    <CheckIcon className="h-4 w-4 text-accent-text" />
                  ) : (
                    // 1.5rem inside a 44px ring with a 4px stroke: the mark
                    // fills the hole without touching the arc.
                    <SubjectMark
                      subjectNameAr={course.subjectNameAr}
                      className="size-6 rounded-[6px]"
                    />
                  )}
                </ProgressRing>

                <span className="min-w-0 flex-1">
                  <span className="pth-rail__title">{course.title}</span>
                  <span className="pth-rail__meta">
                    {isDone
                      ? course.contentComplete
                        ? c.courseDone
                        : c.courseUpToDate
                      : `${course.clearedLessons} / ${course.totalLessons}`}
                  </span>
                  <span className="pth-rail__bar" aria-hidden="true">
                    <span style={{ '--pth-fill': `${course.progressPercent}%` } as CSSProperties} />
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
