import Link from 'next/link';
import { Lock, Play } from 'lucide-react';
import { copy, type LearningPath } from '@ayman/contracts';
import type { StudentExam } from '@ayman/contracts/quiz/scheduled';
import { quizHref } from '@/lib/quiz-links';

const c = copy.path;

/**
 * The side column of /path — the first-round design. Everything in it is
 * derived from what the page already fetched, so it cannot disagree with the
 * timeline: «اللي جاي» is the next lecture of the course in progress and the
 * two after it; the exam card is the same exam the home page counts down to
 * (`bandExam`), and renders nothing on a stack without monthly exams.
 */
export function PathSide({ path, exam }: { path: LearningPath; exam: StudentExam | null }) {
  const course = path.courses.find((entry) => entry.id === path.currentCourseId);
  const at = course ? course.nodes.findIndex((node) => node.id === course.nextLessonId) : -1;
  const upNext = course && at >= 0 ? course.nodes.slice(at, at + 3) : [];

  return (
    <aside className="pth-side" aria-label={c.upNextTitle}>
      <section className="pth-side__card">
        <h2 className="pth-side__title">{c.upNextTitle}</h2>
        {course && upNext.length > 0 ? (
          <ol className="pth-side__list">
            {upNext.map((node, i) => {
              const locked = node.gate === 'locked' || !course.published;
              const mark = (
                <span
                  className="pth-side__mark"
                  data-now={i === 0 ? '' : undefined}
                  data-quiz={node.kind === 'quiz' ? '' : undefined}
                  aria-hidden="true"
                >
                  {locked ? <Lock className="size-3" /> : i === 0 ? <Play className="size-2.5" fill="currentColor" /> : null}
                </span>
              );
              return (
                <li key={node.id}>
                  {locked ? (
                    <span className="pth-side__row" data-locked="">
                      {mark}
                      <span className="pth-side__name">{node.title}</span>
                    </span>
                  ) : (
                    <Link href={`/courses/${course.slug}/lessons/${node.lessonId}`} className="pth-side__row">
                      {mark}
                      <span className="pth-side__name">{node.title}</span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="pth-side__empty">{c.upNextEmpty}</p>
        )}
      </section>

      {exam ? (
        <section className="pth-side__card pth-side__exam">
          <span className="pth-side__exam-text">
            <span className="pth-side__exam-tag">
              {c.examTitle} · {exam.phase === 'open' ? c.examOpen : c.examUpcoming}
            </span>
            <strong className="pth-side__exam-name">{exam.title}</strong>
          </span>
          {exam.phase === 'open' ? (
            <Link href={quizHref(exam.lessonId)} className="chip chip--solid">
              {c.examGo}
            </Link>
          ) : null}
        </section>
      ) : null}
    </aside>
  );
}
