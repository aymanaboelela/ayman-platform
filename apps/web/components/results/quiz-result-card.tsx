import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarCheck2,
  Check,
  Equal,
  Hourglass,
  Sparkles,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { attemptAllowance, copy, formatCopy, type QuizHistoryRow } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { ProgressRing } from '@/components/progress-ring';
import { formatDay, verdictOf, type Verdict } from '@/lib/results-view';
import { quizHref, reviewHref } from '@/lib/quiz-links';

const c = copy.results;

/**
 * The ring's colour per verdict — the same `--ok` / `--err` every other
 * screen uses for a pass and a fail, because this IS that verdict. «امتياز»
 * keeps the pass colour on the ring and earns a separate badge: it is a pass
 * first.
 */
const RING: Record<Verdict, string> = {
  excellent: 'var(--ok)',
  passed: 'var(--ok)',
  failed: 'var(--err)',
  pending: 'var(--info)',
};

const BADGE: Record<Verdict, { icon: LucideIcon; label: string }> = {
  excellent: { icon: Check, label: c.verdictPassed },
  passed: { icon: Check, label: c.verdictPassed },
  // `copy.quiz.failed` — «محتاجة مراجعة» — is a STATE with a way forward,
  // and it is the word the quiz's own results screen already uses. The card
  // must not say something harsher about the same sitting.
  failed: { icon: BookOpen, label: copy.quiz.failed },
  pending: { icon: Hourglass, label: copy.quiz.pendingNotFinal },
};

/**
 * One exam the student has sat: its score at a glance, how the latest sitting
 * compared with the one before, and the two things there are to do about it.
 *
 * ## Why both "best" and "latest"
 *
 * They answer different questions. `best` is what COUNTS — the higher of the
 * two sittings is the student's grade — and `latest` is how it went most
 * recently, which is the one a student checks after an improvement sitting.
 * Showing only the best hides a decline; showing only the latest hides a pass.
 *
 * With ONE sitting they are the same attempt, so `latest` is not printed at
 * all: two identical figures side by side read as two results, and that is
 * almost every card on this page (every quiz is one graded sitting; only the
 * final exam offers a second).
 *
 * ## The delta
 *
 * `delta` is the latest sitting minus the one before it (`latestDeltas`,
 * from the series the page already has). A rise is green with an arrow; a
 * fall is quiet grey, NOT red — the best still counts, and a student reading
 * a lower second paper does not need the card to say it twice.
 *
 * ## The review link is unconditional
 *
 * It always renders, even when the review window is closed. The review route
 * resolves the quiz's 4×7 review matrix SERVER-SIDE and renders a designed
 * `<ReviewLocked>` explanation when the window forbids it, so following this
 * link can never leak anything and never dead-ends — a student gets told why,
 * which is strictly better than a link that silently is not there.
 */
export function QuizResultCard({
  row,
  delta = null,
  showCourse = false,
  headingLevel = 3,
}: {
  row: QuizHistoryRow;
  delta?: number | null;
  /** Off inside a course group, whose header already names the course. */
  showCourse?: boolean;
  /** 3 under the section's h2; 4 under a course group's h3. */
  headingLevel?: 3 | 4;
}) {
  const verdict = verdictOf(row);
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  const Badge = BADGE[verdict].icon;

  const attempts = row.allowsImprovement
    ? formatCopy(c.attemptsOf, {
        used: row.attemptsUsed,
        // Never a literal 2. The allowance has exactly one home, and a copy of
        // it here is the sort of thing that survives a rule change by weeks.
        max: attemptAllowance(row.allowsImprovement),
      })
    : copy.quiz.singleAttempt;

  /*
   * The ONLY route back into a quiz from this screen. It is not a retake: it
   * exists solely for the final exam's single improvement sitting, and both
   * flags are required because neither implies the other — a quiz that never
   * offered one, and an exam whose one sitting is spent, are different states
   * that must not collapse into one falsy check.
   */
  const canImprove = row.allowsImprovement && !row.improvementUsed;

  return (
    <li className="rs-exam" data-verdict={verdict}>
      <div className="rs-exam__top">
        <ProgressRing percent={row.bestPercent ?? 0} size={64} color={RING[verdict]}>
          <span className="rs-exam__ring-num rs-ltr" aria-hidden="true">
            {row.bestPercent === null ? '—' : `${row.bestPercent}%`}
          </span>
        </ProgressRing>

        <div className="rs-exam__id">
          <Heading className="rs-exam__title">{row.quizTitle}</Heading>
          {showCourse ? <p className="rs-exam__course">{row.courseTitle}</p> : null}
          <p className="rs-exam__badges">
            <span className="rs-verdict" data-verdict={verdict}>
              <Badge className="size-3.5" aria-hidden="true" />
              {BADGE[verdict].label}
            </span>
            {verdict === 'excellent' ? (
              <span className="rs-verdict" data-verdict="star">
                <Star className="size-3.5" aria-hidden="true" />
                {c.verdictExcellent}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <dl className="rs-exam__figs">
        <Figure label={c.best} percent={row.bestPercent} passed={row.passed} />
        {row.attemptsUsed > 1 ? (
          <Figure label={c.latest} percent={row.latestPercent} passed={null} delta={delta} />
        ) : null}
        <div className="rs-fig">
          <dt className="rs-fig__label">{c.attemptsUsed}</dt>
          {/* `whitespace-nowrap`: it is a value, not prose — «محاولة واحدة»
              wrapping to two stacked lines pushed the card's height out. */}
          <dd className="rs-fig__value rs-fig__value--quiet whitespace-nowrap">{attempts}</dd>
        </div>
      </dl>

      <div className="rs-exam__foot">
        {canImprove ? (
          <p className="rs-exam__status" data-open="">
            <Sparkles className="size-4 shrink-0" aria-hidden="true" />
            {c.improveOpen}
          </p>
        ) : (
          <p className="rs-exam__status">
            <CalendarCheck2 className="size-4 shrink-0" aria-hidden="true" />
            <time dateTime={row.lastSubmittedAt}>
              {formatCopy(c.submittedOn, { date: formatDay(row.lastSubmittedAt) })}
            </time>
          </p>
        )}

        <div className="rs-exam__actions">
          {/* SOLID when reviewing is the one thing left to do about this
              exam — a paper under the pass mark with no second sitting —
              which is also what the hero's sentence for a low average points
              at. Outlined everywhere else, so an improvement sitting, when
              there is one, stays the single loudest button on the card. */}
          <Link
            href={reviewHref(row.lessonId, row.latestAttemptId)}
            className={cn('chip', verdict === 'failed' && !canImprove ? 'chip--solid' : 'chip--accent')}
          >
            {copy.quiz.reviewAnswers}
          </Link>
          {canImprove ? (
            // To the quiz's own intro page, not straight into a new attempt.
            // Starting a graded exam is not something a link should do on a
            // mis-tap — that page states the duration, the marks and the
            // attempts left, and owns the button that actually creates one.
            <Link href={quizHref(row.lessonId)} className="chip chip--solid">
              {copy.quiz.improveExam}
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * One figure, coloured green or red only when it is a VERDICT.
 *
 * ## ⚠️ The verdict is `passed`, never a percentage compared to 50
 *
 * This used to colour on `percent >= 50`, and 50 is not this platform's pass
 * mark anywhere. Each quiz carries its own `passPercent` — the live foundation
 * exam's is **70** — and `QuizHistoryRow.passed` is the server's answer,
 * computed from the BEST attempt against that quiz's own mark, which is the
 * same value `ExamsSection` and `recordQuizResult` use.
 *
 * So every score from 50 to 69 was printed in GREEN on `/results` while the
 * dashboard, the lesson and the student's actual grade all said failed.
 *
 * `passed` is nullable (an attempt awaiting essay grading has no verdict yet),
 * and null reads as neutral rather than as a fail.
 *
 * `latest` passes `null` deliberately: a lower recent score coloured red next
 * to a green best would say "you failed" about a quiz the student has already
 * passed. Only the figure that DECIDES the grade wears the verdict's colour.
 */
function Figure({
  label,
  percent,
  passed,
  delta = null,
}: {
  label: string;
  percent: number | null;
  passed: boolean | null;
  delta?: number | null;
}) {
  return (
    <div className="rs-fig">
      <dt className="rs-fig__label">{label}</dt>
      <dd
        className={cn(
          'rs-fig__value',
          percent === null
            ? 'text-fg-muted'
            : passed === null
              ? 'text-fg'
              : passed
                ? 'text-[color:var(--ok)]'
                : 'text-[color:var(--err)]',
        )}
      >
        <span className="rs-ltr">{percent === null ? c.noneYet : `${percent}%`}</span>
        {delta === null ? null : <Delta delta={delta} />}
      </dd>
    </div>
  );
}

function Delta({ delta }: { delta: number }) {
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
  const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Equal;
  const words =
    direction === 'up' ? c.deltaUp : direction === 'down' ? c.deltaDown : c.deltaSame;

  return (
    <span className="rs-delta" data-direction={direction}>
      <Icon className="size-3.5" aria-hidden="true" />
      {direction === 'same' ? null : (
        <span className="rs-ltr" aria-hidden="true">
          {Math.abs(delta)}
        </span>
      )}
      <span className="sr-only">{formatCopy(words, { n: Math.abs(delta) })}</span>
    </span>
  );
}
