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
 * «امتحانات الشهر» in the lesson rail — ONE line per exam: the name, when it
 * closes, the button. Monthly exams are kept out of the outline on purpose
 * (one failed sitting must never shut a lecture), so this sits beside it
 * rather than as rows inside it. Renders nothing when there is no door — most
 * lesson views.
 *
 * It was a card with a heading, a sub-card per exam and a full-width button
 * each: about 160px of rail for one sentence's worth of fact. The heading is
 * for screen readers now; sighted students get the clipboard glyph and the
 * amber button, which say «امتحان» faster than a title does.
 */
export function CourseExamsCard({ exams }: { exams: readonly StudentExam[] }) {
  if (exams.length === 0) return null;

  return (
    <section className="ce-card" aria-labelledby="course-exams-title">
      <h2 id="course-exams-title" className="sr-only">
        {c.title}
      </h2>

      <ul className="ce-card__list">
        {exams.map((exam) => {
          const late = exam.phase === 'closed';
          return (
            <li key={exam.lessonId} className="ce-exam" data-late={late ? '' : undefined}>
              <ClipboardList className="ce-exam__icon size-[18px]" aria-hidden="true" />

              <div className="ce-exam__text">
                <span className="ce-exam__name">
                  {exam.title}
                  <span className="ce-exam__tag">{late ? c.late : c.open}</span>
                </span>
                {late ? (
                  <span className="ce-exam__meta">{c.lateNote}</span>
                ) : exam.openUntil ? (
                  <span className="ce-exam__meta">
                    {formatCopy(c.closesLine, { date: stamp.format(new Date(exam.openUntil)) })}
                  </span>
                ) : null}
              </div>

              {exam.hasSat ? (
                <Link href={quizHref(exam.lessonId)} className="ce-exam__done">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {c.review}
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
