import Link from 'next/link';
import { CalendarClock, CheckCircle2 } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { StudentExam } from '@ayman/contracts/quiz/scheduled';
import { cn } from '@ayman/ui/lib/cn';
import { bandExam } from '@/lib/exams';
import { quizHref } from '@/lib/quiz-links';

const s = copy.player.examStrip;
const c = copy.player.courseExams;

const day = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: 'Africa/Cairo',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * Which of a course's monthly exams the course itself offers a door to.
 *
 * Open ones, and the KEPT-OPEN ones past their deadline that this student has
 * not sat. The second group is why the door exists at all: once the deadline
 * passes the dashboard band lets go of the exam (`examDeadline`), and without
 * this the student who missed it would have nowhere to find a paper the server
 * still accepts. A kept-open exam they already sat is a result, and results
 * live on the dashboard shelf, not here.
 *
 * Moved here from `course-exams-card.tsx` with the card it served.
 */
export function courseExamDoors(exams: readonly StudentExam[], courseId: string): StudentExam[] {
  return exams.filter(
    (exam) =>
      exam.courseId === courseId &&
      (exam.phase === 'open' || (exam.phase === 'closed' && exam.keptOpen && !exam.hasSat)),
  );
}

/**
 * Which exams the lesson page shows, in order: this course's own doors first
 * (`courseExamDoors` — open ones, and a kept-open one past its deadline the
 * student has not sat, which has NO other door once the dashboard lets go of
 * it), else the one exam the dashboard counts down to (`bandExam`), unless it
 * is already sat — a result belongs on the dashboard shelf, not beside a
 * lecture. Empty on a stack without exams: `getStudentExamsOrEmpty` answers
 * `[]` there without a request.
 */
export function lessonExams(exams: readonly StudentExam[], courseId: string): StudentExam[] {
  const doors = courseExamDoors(exams, courseId);
  if (doors.length > 0) return doors;
  const band = bandExam(exams);
  return band && !band.hasSat ? [band] : [];
}

/**
 * «امتحان الشهر» as ONE dark strip above «محتوى الكورس» — the board's
 * `امتحان شهر نوفمبر · مفتوح لحد الخميس · ٤٠ دقيقة · [ابدأ]`.
 *
 * It replaced `CourseExamsCard` (same doors, same links, same copy for a
 * late paper), whose amber row read as one more card in the rail. Dark so it is the one thing in
 * the column that is not the outline, and the orange button is the column's
 * only one. An `upcoming` exam has no button — there is nothing to press yet,
 * only a date.
 *
 * `slot` decides where it shows: the rail is desktop-only and the door slot
 * under the title bar is phone-only, so the strip is rendered twice and each
 * copy hides at the other's breakpoint (see `lesson-cinema.css`).
 */
export function LessonExamStrip({ exams, slot }: { exams: readonly StudentExam[]; slot: 'rail' | 'door' }) {
  if (exams.length === 0) return null;

  return (
    <section className={cn('lx-strips', `lx-strips--${slot}`)} aria-label={c.title}>
      {exams.map((exam) => {
        const late = exam.phase === 'closed';
        const upcoming = exam.phase === 'upcoming';
        const when = upcoming
          ? exam.openFrom
            ? formatCopy(s.opensOn, { date: day.format(new Date(exam.openFrom)) })
            : null
          : late
            ? `${c.late} · ${c.lateNote}`
            : exam.openUntil
              ? formatCopy(s.openUntil, { date: day.format(new Date(exam.openUntil)) })
              : c.open;
        const minutes = exam.durationSeconds
          ? formatCopy(s.minutes, { n: Math.round(exam.durationSeconds / 60) })
          : null;
        const meta = [when, late ? null : minutes].filter(Boolean).join(' · ');

        return (
          <div key={exam.lessonId} className="lx-strip" data-late={late ? '' : undefined}>
            <span className="lx-strip__disc" aria-hidden="true">
              <CalendarClock className="size-5" />
            </span>
            <span className="lx-strip__text">
              <span className="lx-strip__name">{exam.title}</span>
              {meta ? <span className="lx-strip__meta">{meta}</span> : null}
            </span>
            {upcoming ? null : exam.hasSat ? (
              <Link href={quizHref(exam.lessonId)} className="lx-strip__review">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {c.review}
              </Link>
            ) : (
              <Link href={quizHref(exam.lessonId)} className="lx-strip__go" aria-label={`${c.start} — ${exam.title}`}>
                {s.go}
              </Link>
            )}
          </div>
        );
      })}
    </section>
  );
}
