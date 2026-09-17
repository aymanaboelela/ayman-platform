import { copy, formatCopy, formatMark } from '@ayman/contracts';
import { Badge } from '@ayman/ui';

export interface ResultHeaderProps {
  scaledScore: number | null;
  gradeOutOf: number;
  passPercent: number;
  passed: boolean | null;
  /** Derived by the review page from `questions.some(q => q.correctness === 'needsGrading')`. */
  needsGrading: boolean;
  /**
   * Marks still with the instructor, out of `gradeOutOf` — `0` on a finished
   * paper. Server-computed (`mark-split.ts`), never inferred here from the
   * questions array: the review matrix can hide `maxMark` entirely, and a
   * screen that silently drops the "٥٠ درجة جاية" line in that window is the
   * bug this component exists to fix.
   */
  pendingOutOf: number;
  /** What the marked part is worth. Sums with `pendingOutOf` to `gradeOutOf`. */
  gradedOutOf: number;
}

/**
 * `--ok`/`--err` appear HERE and on the per-question verdicts
 * (`review-question.tsx`) — nowhere else in the product. No confetti, no
 * gradient ring, no emoji.
 *
 * ## Two different screens, decided by `pendingOutOf`
 *
 * On a finished paper this is what it always was: the mark over the quiz's
 * total, a pass/fail badge, the pass line, and a band.
 *
 * On a paper whose essays are still with مهندس أيمن it is deliberately NOT
 * that screen, because that screen lies. `gradeAttempt` counts an ungraded
 * answer as zero — correctly, since a provisional total must come from
 * somewhere and a pending answer can only raise it — so a midterm marked out
 * of 100 with 50 marks of essay outstanding rendered «٤٨٫٥ / ١٠٠» in title
 * type with a red «محتاجة مراجعة» next to it. The student reads a near-fail.
 * They in fact scored 48.5 of the 50 anyone has looked at.
 *
 * So while marks are outstanding:
 *
 *   · the denominator is `gradedOutOf`, not `gradeOutOf` — the marked part
 *     reported out of what the marked part is worth, under an eyebrow that
 *     names which half of the paper that is;
 *   · the verdict badge is replaced, not merely hidden. `passed` is non-null
 *     on a pending attempt (a provisional pass is honest, a provisional fail
 *     is not), and rendering the badge at all would put «محتاجة مراجعة» on a
 *     paper nobody has finished reading. «لسه بتتصحّح» is a state, and it is
 *     the true one;
 *   · the pass line comes off with it. «درجة النجاح ٥٠٪» under a mark out of
 *     a different total is an invitation to compare two numbers that are not
 *     on the same scale;
 *   · the outstanding amount is stated as an amount, in marks, followed by
 *     where the rest will arrive. A gap the student has to compute is the
 *     thing that frightens them.
 */
export function ResultHeader({
  scaledScore,
  gradeOutOf,
  passPercent,
  passed,
  needsGrading,
  pendingOutOf,
  gradedOutOf,
}: ResultHeaderProps) {
  /*
   * `pendingOutOf > 0` is the authority, and `needsGrading` is kept as a
   * fallback for the one window where it is the only evidence there is: a
   * review matrix that hides `marks` still ships `correctness`, and a payload
   * from an API deployed before `pendingOutOf` existed carries 0. Falling back
   * to the old undivided screen with the old «إجابتك المقالية...» line is the
   * right degradation — never to a confident «٤٨٫٥ / ١٠٠».
   */
  const pending = pendingOutOf > 0;
  const outstanding = pending || needsGrading;

  const band =
    passed === null || outstanding
      ? null
      : passed && scaledScore !== null && scaledScore / gradeOutOf >= 0.9
        ? copy.quiz.scoreBandExcellent
        : passed
          ? copy.quiz.scoreBandGood
          : copy.quiz.scoreBandNeedsWork;

  // The total the headline is over. Not a cosmetic choice — see the header.
  const outOf = pending ? gradedOutOf : gradeOutOf;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-5">
      <p className="eyebrow">{pending ? copy.quiz.pendingEyebrow : copy.quiz.resultsTitle}</p>

      <div className="flex flex-wrap items-baseline gap-3">
        <p className="mono text-[length:var(--fs-title-1)] tabular-nums text-fg">
          {scaledScore === null ? '—' : formatMark(scaledScore)}
          <span className="text-fg-muted"> / {formatMark(outOf)}</span>
        </p>
        {outstanding ? (
          // `accent`, never `ok`/`err`: nothing has been decided yet, and the
          // two colours this screen reserves both read as a decision.
          <Badge tone="accent">{copy.quiz.pendingNotFinal}</Badge>
        ) : passed !== null ? (
          <Badge tone={passed ? 'ok' : 'err'}>{passed ? copy.quiz.passed : copy.quiz.failed}</Badge>
        ) : null}
      </div>

      {outstanding ? null : (
        <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
          {formatCopy(copy.quiz.passMark, { percent: passPercent })}
        </p>
      )}

      {pending ? (
        <div className="flex flex-col gap-1">
          {/* `text-fg`, not muted: this is the sentence the whole change is
              for, and a grey line under a big number gets skipped. */}
          <p className="text-fg">
            {formatCopy(copy.quiz.pendingRest, { marks: formatMark(pendingOutOf) })}
          </p>
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
            {copy.quiz.pendingWillArrive}
          </p>
        </div>
      ) : needsGrading ? (
        <p className="text-fg-muted">{copy.quiz.essayPending}</p>
      ) : band ? (
        <p className="text-fg">{band}</p>
      ) : null}
    </div>
  );
}
