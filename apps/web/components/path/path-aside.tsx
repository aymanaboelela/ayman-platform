import Link from 'next/link';
import { Check, Lock, Play } from 'lucide-react';
import { copy, type LearningPath } from '@ayman/contracts';
import { CourseArt } from '@/components/course-art';

const c = copy.path;

/**
 * «Cinema» — the side column of /path on his stack (`page.tsx` renders it only
 * when `IS_AYMAN`; other teachers keep the single-column page).
 *
 * Everything here is derived from the same `LearningPath` the timeline reads,
 * so it cannot disagree with it: «اللي جاي» is the next lecture of the course
 * in progress and the two after it, «لحد دلوقتي» is the totals.
 */
export function PathAside({ path }: { path: LearningPath }) {
  const course = path.courses.find((entry) => entry.id === path.currentCourseId);
  const at = course ? course.nodes.findIndex((node) => node.id === course.nextLessonId) : -1;
  const upNext = course && at >= 0 ? course.nodes.slice(at, at + 3) : [];
  const coursesDone = path.courses.filter(
    (entry) => entry.totalLessons > 0 && entry.clearedLessons === entry.totalLessons,
  ).length;

  return (
    <aside className="pth-aside" aria-label={c.upNextTitle}>
      {course && upNext.length > 0 ? (
        <section className="pth-panel">
          <h2 className="pth-panel__title">{c.upNextTitle}</h2>
          <p className="pth-panel__lead">{c.upNextLead}</p>
          <ol className="pth-next">
            {upNext.map((node, i) => {
              const locked = node.gate === 'locked' || !course.published;
              const body = (
                <>
                  <span className="pth-next__art" aria-hidden="true">
                    <CourseArt
                      coverKey={course.coverKey}
                      subjectNameAr={course.subjectNameAr}
                      seed={course.slug}
                      compact
                      sizes="96px"
                    />
                    <span className="pth-next__icon">
                      {locked ? <Lock className="size-3" /> : i === 0 ? <Play className="size-3" fill="currentColor" /> : null}
                    </span>
                  </span>
                  <span className="pth-next__title">{node.title}</span>
                  {locked ? null : <span className="pth-next__go">{c.upNextOpen}</span>}
                </>
              );
              return (
                <li key={node.id}>
                  {locked ? (
                    <span className="pth-next__row" data-locked="">
                      {body}
                    </span>
                  ) : (
                    <Link
                      href={`/courses/${course.slug}/lessons/${node.lessonId}`}
                      className="pth-next__row"
                      data-first={i === 0 ? '' : undefined}
                    >
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <section className="pth-panel">
        <h2 className="pth-panel__title">{c.soFarTitle}</h2>
        <div className="pth-sofar">
          <p className="pth-sofar__tile">
            <span className="pth-sofar__n" dir="ltr">
              {path.clearedLessons}
              <span className="pth-sofar__of">/{path.totalLessons}</span>
            </span>
            <span className="pth-sofar__label">{c.soFarLessons}</span>
          </p>
          <p className="pth-sofar__tile">
            <span className="pth-sofar__n" dir="ltr">
              {coursesDone}
              <span className="pth-sofar__of">/{path.courses.length}</span>
            </span>
            <span className="pth-sofar__label">
              <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> {c.soFarCourses}
            </span>
          </p>
        </div>
      </section>
    </aside>
  );
}
