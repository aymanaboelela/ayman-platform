import { copy, formatCopy, formatMark } from '@ayman/contracts';
import { Badge } from '@ayman/ui';

export interface ResultHeaderProps {
  scaledScore: number | null;
  gradeOutOf: number;
  passPercent: number;
  passed: boolean | null;
  /** Derived by the review page from `questions.some(q => q.correctness === 'needsGrading')`. */
  needsGrading: boolean;
}

/**
 * `--ok`/`--err` appear HERE and on the per-question verdicts
 * (`review-question.tsx`) — nowhere else in the product. No confetti, no
 * gradient ring, no emoji.
 */
export function ResultHeader({ scaledScore, gradeOutOf, passPercent, passed, needsGrading }: ResultHeaderProps) {
  const band =
    passed === null || needsGrading
      ? null
      : passed && scaledScore !== null && scaledScore / gradeOutOf >= 0.9
        ? copy.quiz.scoreBandExcellent
        : passed
          ? copy.quiz.scoreBandGood
          : copy.quiz.scoreBandNeedsWork;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-5">
      <p className="eyebrow">{copy.quiz.resultsTitle}</p>

      <div className="flex flex-wrap items-baseline gap-3">
        <p className="mono text-[length:var(--fs-title-1)] tabular-nums text-fg">
          {scaledScore === null ? '—' : formatMark(scaledScore)}
          <span className="text-fg-muted"> / {gradeOutOf}</span>
        </p>
        {passed !== null ? (
          <Badge tone={passed ? 'ok' : 'err'}>{passed ? copy.quiz.passed : copy.quiz.failed}</Badge>
        ) : null}
      </div>

      <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
        {formatCopy(copy.quiz.passMark, { percent: passPercent })}
      </p>

      {needsGrading ? (
        <p className="text-fg-muted">{copy.quiz.essayPending}</p>
      ) : band ? (
        <p className="text-fg">{band}</p>
      ) : null}
    </div>
  );
}
