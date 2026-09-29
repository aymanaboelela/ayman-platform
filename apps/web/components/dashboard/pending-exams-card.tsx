import Link from 'next/link';
import { ClipboardCheck, Sparkles } from 'lucide-react';
import { copy, formatCopy, type PendingExam } from '@ayman/contracts';
import { quizHref } from '@/lib/quiz-links';
import { PanelHead } from './panel-head';

const c = copy.dashboard;

/**
 * «امتحانات في انتظارك» — a course that is genuinely finished, with its exam
 * sitting there open and nobody has pressed it yet.
 *
 * ## Why this is not the same list as «امتحاناتك»
 *
 * `ExamsSection` is the record of every exam a student HAS sat — the verdict,
 * the improvement sitting if one is owed. This card is the opposite half:
 * exams a student has NOT sat, where the only thing stopping them is that
 * nobody told them the door was open. `DashboardService.forUser` builds the
 * list from the same authority the player routes enforce (`LessonGateService`)
 * so it can never claim a course is ready while a lecture is still
 * outstanding, and it deliberately excludes an exam with a `failed` attempt
 * on it — that is an improvement sitting still owed, and it already has its
 * own row, in amber, on `ExamsSection`. Showing it here too would put the same
 * exam on the same screen twice with two different verbs attached.
 *
 * ## Absent, not empty
 *
 * Most students, most of the time, have nothing waiting here — either they
 * have not finished a course yet or they already sat its exam the day it
 * opened. Rendering an empty-state box for that would put a permanently blank
 * card on the busiest screen in the product, so the section renders nothing
 * at all rather than an "لا يوجد" placeholder — the same call `recommendedCourses`
 * makes on the page for the exact same reason.
 *
 * ## Its own card, with the same head as its neighbours
 *
 * It used to be a bare `.group-head` list the page wrapped in a card shell
 * (`AsideBlock`, now gone). Every other card in the aside now opens with `PanelHead`,
 * and a lone ember rule among four coloured heads read as the one card nobody
 * had finished. Amber, because this is the one card in the column that is
 * an ACTION waiting — the colour the rest of the page spends on "press this".
 */
export function PendingExamsCard({ exams }: { exams: readonly PendingExam[] }) {
  if (exams.length === 0) return null;

  return (
    <section className="aside-card">
      <PanelHead icon={ClipboardCheck} hue="amber" title={c.pendingExamsTitle} />

      <ul className="aside-card__body space-y-2">
        {exams.map((exam) => (
          <li key={exam.lessonId}>
            <PendingExamRow exam={exam} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PendingExamRow({ exam }: { exam: PendingExam }) {
  return (
    <div className="attempt-row attempt-row--action">
      <span className="attempt-row__well" aria-hidden="true">
        <Sparkles className="size-[1.125rem]" />
      </span>
      <span className="attempt-row__text">
        <Link
          href={quizHref(exam.lessonId)}
          className="attempt-row__title after:absolute after:inset-0 after:content-['']"
        >
          {exam.lessonTitle}
        </Link>
        <span className="attempt-row__meta">
          {formatCopy(c.pendingExamsMeta, { course: exam.courseTitle })}
        </span>
      </span>
      <span className="chip chip--solid">{c.pendingExamsCta}</span>
    </div>
  );
}
