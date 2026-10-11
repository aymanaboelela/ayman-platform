import Link from 'next/link';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { StudentExam } from '@ayman/contracts/quiz/scheduled';
import { quizHref } from '@/lib/quiz-links';
import './player-cards.css';

const c = copy.player.courseExams;

const stamp = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: 'Africa/Cairo',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * Which of a course's monthly exams the course itself offers a door to.
 *
 * Open ones, and the KEPT-OPEN ones past their deadline that this student has
 * not sat. The second group is the reason this card exists: once the deadline
 * passes the dashboard band lets go of the exam (`examDeadline`), and without
 * this the student who missed it would have nowhere to find a paper the server
 * still accepts. A kept-open exam they already sat is a result, and results
 * live on the dashboard shelf, not here.
 */
export function courseExamDoors(exams: readonly StudentExam[], courseId: string): StudentExam[] {
  return exams.filter(
    (exam) =>
      exam.courseId === courseId &&
      (exam.phase === 'open' || (exam.phase === 'closed' && exam.keptOpen && !exam.hasSat)),
  );
}

/**
 * «امتحانات الشهر» in the lesson sidebar. Monthly exams are kept out of the
 * outline on purpose (one failed sitting must never shut a lecture), so this
 * is a card beside it rather than rows inside it. Renders nothing when there
 * is no door — most lesson views.
 */
export function CourseExamsCard({ exams }: { exams: readonly StudentExam[] }) {
  if (exams.length === 0) return null;

  return (
    <section className="ce-card" aria-labelledby="course-exams-title">
      <h2 id="course-exams-title" className="ce-card__title">
        <ClipboardList className="size-4" aria-hidden="true" />
        {c.title}
      </h2>

      <ul className="ce-card__list">
        {exams.map((exam) => {
          const late = exam.phase === 'closed';
          return (
            <li key={exam.lessonId} className="ce-exam" data-late={late ? '' : undefined}>
              <div className="ce-exam__head">
                <span className="ce-exam__name">{exam.title}</span>
                <span className="ce-exam__tag">{late ? c.late : c.open}</span>
              </div>

              {late ? (
                <p className="ce-exam__meta">{c.lateNote}</p>
              ) : exam.openUntil ? (
                <p className="ce-exam__meta">
                  {formatCopy(c.closesLine, { date: stamp.format(new Date(exam.openUntil)) })}
                </p>
              ) : null}

              {exam.hasSat ? (
                <Link href={quizHref(exam.lessonId)} className="ce-exam__done">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {c.sat} · {c.review}
                </Link>
              ) : (
                <Link href={quizHref(exam.lessonId)} className="ce-exam__cta">
                  {c.start}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
