import Link from 'next/link';
import { CalendarOff, GraduationCap } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy, formatMark } from '@ayman/contracts/format';
import type { StudentExam } from '@ayman/contracts/quiz/scheduled';
import { quizHref } from '@/lib/quiz-links';

const c = copy.dashboard.exams;

/**
 * «امتحانات الشهر» — where a monthly exam goes once its window has shut.
 *
 * ## Why the closed ones leave the top of the page
 *
 * The countdown band above is about a paper that is still ahead of the student:
 * a clock, a syllabus to revise, and eventually a door. None of that is true of
 * an exam that closed on Saturday, and a band counting down to something that
 * already happened is furniture. So `closed` drops out of the band entirely and
 * lands here, in the MAIN column beside «امتحاناتك», where every row is a
 * result with somewhere to go.
 *
 * ## Why it is not folded into `<ExamsSection>`
 *
 * That section is the running history of every quiz a student has SAT, keyed on
 * `/api/me/quizzes` and ordered most-recent-first — a lecture quiz and a monthly
 * exam are the same kind of row to it. This one is the month's papers
 * specifically, and it has a row `ExamsSection` structurally cannot draw: the
 * exam a student MISSED. A missed exam produces no attempt, so it appears in no
 * history at all — and «مدخلتش الامتحان ده» is a fact worth being told once,
 * rather than an exam that silently never existed.
 *
 * ## Absent, not empty — with one exception
 *
 * A student with no monthly exams at all gets nothing: no heading, no empty
 * box. That is most accounts until the first one is scheduled, and a permanent
 * blank card on the busiest screen in the product is the thing
 * `PendingExamsCard` and `recommendedCourses` both refuse to be.
 *
 * The exception is a student who HAS one — counting down to it in the band
 * above — and has not finished one yet. For them the shelf renders with
 * `closedEmpty` on it, because the question that empty state answers («فين
 * الامتحان بعد ما يخلص؟») is one they are about to have. It disappears again
 * for everyone else.
 *
 * ## No cap, and no «كل امتحاناتك» link
 *
 * `ExamsSection` shows four rows and defers to `/results` because a quiz
 * history runs to dozens. Monthly exams run to one a month — under ten a year,
 * and every one of them is the kind of row a student wants to see. A "show all"
 * behind eight rows is a press that buys nothing.
 */
export function MonthlyExamsSection({ exams }: { exams: readonly StudentExam[] }) {
  /*
   * The filter lives HERE rather than on the page, matching `scheduleLines` in
   * `dashboard-hero.tsx`: the rule that decides which exams belong on this
   * shelf sits next to the markup that depends on it, and passing the whole
   * array costs nothing — it is the same one the band above already read.
   */
  const closed = exams.filter((exam) => exam.phase === 'closed');

  if (exams.length === 0) return null;

  return (
    <section>
      <div className="group-head">
        <span className="group-head__mark" aria-hidden="true" />
        <h2 className="group-head__title">{c.closedTitle}</h2>
      </div>

      {closed.length === 0 ? (
        <div className="empty">
          <p className="empty__body">{c.closedEmpty}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {closed.map((exam) => (
            <li key={exam.lessonId}>
              <ClosedExamRow exam={exam} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ClosedExamRow({ exam }: { exam: StudentExam }) {
  /*
   * Three states, and keeping them apart is the whole job of this row.
   *
   *   sat and graded   — «١٨ من ٢٠», and the paper is one press away.
   *   sat, not graded  — an essay paper still with the instructor. `scaledScore`
   *                      is null on purpose here, and printing ٠ for it would
   *                      tell a student who wrote four pages that they got
   *                      nothing.
   *   never sat        — «مدخلتش الامتحان ده». Deliberately NOT «صفر»: they did
   *                      not fail it, they missed it, and those are different
   *                      things to read about yourself.
   */
  const score = exam.hasSat ? exam.scaledScore : null;

  const result =
    score !== null
      ? formatCopy(c.scoreLine, {
          // `formatMark` for the same reason the review screen uses it: a paper
          // worth 3 marks scaled to 20 arrives as `13.3333` out of a
          // `Decimal(10,4)` column, and nobody's exam is out of 13.3333.
          score: formatMark(score),
          outOf: formatMark(exam.gradeOutOf),
        })
      : exam.hasSat
        ? copy.quiz.essayPending
        : c.missed;

  return (
    /*
     * The plain `.attempt-row`, never `--action` or `--counts`. Both of those
     * modifiers are amber, and amber on this surface means "something still to
     * do" or "this is the mark that counts" — a closed exam is neither. The row
     * that DOES wear amber on this page is the improvement sitting in
     * «امتحاناتك», and it must stay the only one.
     */
    <div className="attempt-row">
      <span className="attempt-row__well" aria-hidden="true">
        {exam.hasSat ? (
          <GraduationCap className="size-[1.125rem]" />
        ) : (
          <CalendarOff className="size-[1.125rem]" />
        )}
      </span>

      <span className="attempt-row__text">
        {/*
          A missed exam is a STATEMENT, not a link, and that is why the title
          branches rather than always being an `<a>`. `/quizzes/[lessonId]`
          would load — it is where the closure is explained — but it holds
          nothing for someone with no attempt on it: no paper to read, no mark,
          and a «الامتحان اتقفل» they have already been told on this row. A
          press that arrives somewhere with nothing on it is the second of the
          two ways a press stops meaning anything.
        */}
        {exam.hasSat ? (
          <Link
            href={quizHref(exam.lessonId)}
            className="attempt-row__title after:absolute after:inset-0 after:content-['']"
          >
            {exam.title}
          </Link>
        ) : (
          <span className="attempt-row__title">{exam.title}</span>
        )}

        <span className="attempt-row__meta">{result}</span>
        {/* Which course it belonged to, on its own line rather than joined to
            the mark with a separator — a component that writes «، » or « · »
            has put user-facing text back into a component, which is the rule
            `formatCopy` exists to enforce. */}
        <span className="attempt-row__meta">
          {formatCopy(c.courseLine, { course: exam.courseTitle })}
        </span>
      </span>

      {/* `chip--accent`, the outlined weight: this IS the row's action, but it
          is a review of something finished, and the filled chip stays reserved
          for the one row on the page that is asking for the student's time. */}
      {exam.hasSat ? <span className="chip chip--accent">{c.review}</span> : null}
    </div>
  );
}
