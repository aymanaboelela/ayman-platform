import Link from 'next/link';
import { Check, Hourglass, ListChecks, Play, Sparkles, X } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { MistakeRow, NextStep, ReviewTally } from '@/lib/review-view';

const b = copy.quiz.reviewBoard;

/** Past this many, the rest of the mistakes are a sentence pointing at the paper below. */
const MAX_MISTAKES = 5;

/**
 * صح / غلط — and «بتتصحّح» only while an essay is still with the instructor.
 *
 * The board's third tile, «الوقت», is not here: no endpoint carries how long
 * a sitting took, and a tile with an invented or empty figure is worse than
 * two honest ones.
 */
export function ReviewStats({ tally }: { tally: ReviewTally }) {
  return (
    <ul className="rvc-stats">
      <li className="rvc-stat" data-tone="ok">
        <span className="rvc-stat__icon" aria-hidden="true">
          <Check className="size-4" />
        </span>
        <span className="rvc-stat__value rvc-ltr">{tally.correct}</span>
        <span className="rvc-stat__label">{b.statCorrect}</span>
      </li>
      <li className="rvc-stat" data-tone="err">
        <span className="rvc-stat__icon" aria-hidden="true">
          <X className="size-4" />
        </span>
        <span className="rvc-stat__value rvc-ltr">{tally.wrong}</span>
        <span className="rvc-stat__label">{b.statWrong}</span>
      </li>
      {tally.pending > 0 ? (
        <li className="rvc-stat" data-tone="info">
          <span className="rvc-stat__icon" aria-hidden="true">
            <Hourglass className="size-4" />
          </span>
          <span className="rvc-stat__value rvc-ltr">{tally.pending}</span>
          <span className="rvc-stat__label">{b.statPending}</span>
        </li>
      ) : null}
    </ul>
  );
}

/**
 * «أسئلة محتاجة مراجعة» — the questions the student came here to find, each
 * a row that jumps to its own card in the full paper below (`#q-<slot>`,
 * which `ReviewList` sets when given `anchorPrefix`).
 */
export function ReviewMistakes({ rows }: { rows: readonly MistakeRow[] }) {
  if (rows.length === 0) return null;
  const shown = rows.slice(0, MAX_MISTAKES);
  const more = rows.length - shown.length;

  return (
    <section className="rvc-section" aria-labelledby="rvc-mistakes-title">
      <h2 id="rvc-mistakes-title" className="rvc-h2">
        {b.mistakesTitle}
      </h2>
      <ul className="rvc-mistakes">
        {shown.map((row) => (
          <li key={row.slotPosition} className="rvc-mistake">
            <span className="rvc-mistake__num">
              {formatCopy(copy.quiz.questionNumber, { n: row.slotPosition + 1 })}
            </span>
            <span className="rvc-mistake__text">
              <span className="rvc-mistake__stem">{row.stem}</span>
              {row.picked !== null || row.right !== null ? (
                <small className="rvc-mistake__answers">
                  {row.picked !== null
                    ? formatCopy(b.picked, { answer: row.picked || b.notPicked })
                    : null}
                  {row.picked !== null && row.right !== null ? ' · ' : null}
                  {row.right !== null ? formatCopy(b.right, { answer: row.right }) : null}
                </small>
              ) : null}
            </span>
            <a href={`#q-${row.slotPosition}`} className="rvc-btn rvc-btn--quiet rvc-btn--sm">
              {b.solution}
              <span className="sr-only"> — {formatCopy(copy.quiz.questionNumber, { n: row.slotPosition + 1 })}</span>
            </a>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <p className="rvc-more">
          <a href="#answers">{formatCopy(b.moreMistakes, { n: more })}</a>
        </p>
      ) : null}
    </section>
  );
}

export type ReviewPrimary =
  | { kind: 'improve'; href: string }
  | { kind: 'next'; step: NextStep }
  | { kind: 'review' }
  | null;

/**
 * The two actions — at most ONE orange button, «مش بحب الزحمة للطالب».
 *
 * Which one is orange is the page's decision (`primary`): the improvement
 * sitting on a failed exam that still has one, otherwise the next lesson on
 * the path, otherwise — when there is nowhere to go next — reviewing the
 * answers themselves. Whatever is not orange is quiet.
 */
export function ReviewActions({
  primary,
  next,
  hasAnswers,
}: {
  primary: ReviewPrimary;
  /** The next step — orange when it is the primary, quiet beside an orange review. */
  next: NextStep | null;
  hasAnswers: boolean;
}) {
  const reviewIsPrimary = primary?.kind === 'review';
  // The next lesson rides along quietly only beside an orange «مراجعة
  // الإجابات» — never as a third button next to the improvement sitting.
  const quietNext = next && reviewIsPrimary ? next : null;

  if (!primary && !hasAnswers && !quietNext) {
    return (
      <div className="rvc-actions">
        <Link href="/results" className="rvc-btn rvc-btn--quiet">
          {copy.results.title}
        </Link>
      </div>
    );
  }

  return (
    <div className="rvc-actions">
      {hasAnswers && !reviewIsPrimary ? (
        <a href="#answers" className="rvc-btn rvc-btn--quiet">
          <ListChecks className="size-4" aria-hidden="true" />
          {copy.quiz.reviewAnswers}
        </a>
      ) : null}
      {quietNext ? <NextLink step={quietNext} quiet /> : null}

      {primary?.kind === 'improve' ? (
        // The quiz's own intro page, never straight into a sitting: that page
        // states the paper and owns the button that actually starts one.
        <Link href={primary.href} className="rvc-btn rvc-btn--primary">
          <Sparkles className="size-4" aria-hidden="true" />
          {copy.quiz.improveExam}
        </Link>
      ) : primary?.kind === 'next' ? (
        <NextLink step={primary.step} />
      ) : reviewIsPrimary ? (
        <a href="#answers" className="rvc-btn rvc-btn--primary">
          <ListChecks className="size-4" aria-hidden="true" />
          {copy.quiz.reviewAnswers}
        </a>
      ) : null}
    </div>
  );
}

function NextLink({ step, quiet = false }: { step: NextStep; quiet?: boolean }) {
  const label = step.kind === 'quiz' ? b.nextQuiz : b.nextLecture;
  return (
    <Link
      href={step.href}
      className={quiet ? 'rvc-btn rvc-btn--quiet' : 'rvc-btn rvc-btn--primary'}
      title={step.title}
    >
      <Play className="size-3.5 rvc-flip" aria-hidden="true" />
      {label}
    </Link>
  );
}
