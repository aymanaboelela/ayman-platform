import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { copy, formatCopy, type PendingExam } from '@ayman/contracts';
import { quizHref } from '@/lib/quiz-links';

const c = copy.dashboard;

/**
 * «امتحانات في انتظارك» — the dashboard's only FORWARD-looking account of
 * exams, sitting directly above «امتحاناتك» so the two read as one block:
 * what is waiting, then what already happened.
 *
 * ## The gap this closes
 *
 * A course's exam opens the moment every lecture is cleared, and until now
 * nothing on the home screen said so unless that course also happened to be
 * `continueWatching`'s single most-recently-touched one. A student who
 * finishes course A while still partway through course B would keep
 * `continueWatching` pointed at B — and course A's exam sits open,
 * unmentioned, for as long as they leave it. `ExamsSection` cannot say this
 * either: it lists sittings already taken, and an exam nobody has opened has
 * no attempt to appear as.
 *
 * See `PendingExamSchema` for exactly which state this is — critically, NOT
 * a failed sitting with an improvement attempt still owed, which resolves to
 * the identical `available` gate and belongs to «امتحاناتك» instead.
 *
 * ## Renders nothing when there is nothing waiting
 *
 * Same rule `StartHereCard` and `ContinueWatchingCard` both follow: a card
 * whose only job is announcing an outstanding action has nothing to say once
 * there is none, and "no exams waiting, well done" would be a second
 * all-clear message on a page `MasteryCard`'s own all-clear state already
 * owns.
 *
 * ## Why the row wears amber
 *
 * `.attempt-row--action` — the exact treatment `ExamsSection` gives a row
 * whose improvement sitting is still unspent. Both rows make the same claim:
 * something is open and it is worth the student's time right now. Placed
 * beside «امتحاناتك» rather than up near the hero card, so amber here reads
 * as "this list has an action" rather than competing with the page's one
 * primary button.
 */
export function PendingExamsCard({ exams }: { exams: readonly PendingExam[] }) {
  if (exams.length === 0) return null;

  return (
    <section>
      <div className="group-head">
        <span className="group-head__mark" aria-hidden="true" />
        <h2 className="group-head__title">{c.pendingExamsTitle}</h2>
      </div>

      <ul className="space-y-2">
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
