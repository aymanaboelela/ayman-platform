import { CircleCheck, Hourglass, Sparkles, TrendingUp, type LucideIcon } from 'lucide-react';
// Subpaths, never the root barrel: the book-practice runner renders this from
// a client component, and `@ayman/contracts` would carry the whole copy table
// and every schema into its bundle (`lib/client-barrel.test.ts`).
import { copy } from '@ayman/contracts/copy';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { formatCopy, formatMark } from '@ayman/contracts/format';
import { isolateLtrRuns } from '@/components/dashboard/ltr-runs';
import { tenantSentence } from '@/lib/tenant-copy';
import { resultBand, type ResultBand } from './result-band';

const x = quizExperience.result;

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

const BAND_ICON: Record<ResultBand, LucideIcon> = {
  high: Sparkles,
  pass: CircleCheck,
  low: TrendingUp,
  pending: Hourglass,
};

/**
 * The top of the screen a student lands on straight after submitting — and,
 * with the same props, the top of a book practice's result.
 *
 * ## What it shows
 *
 * The mark over its total; the percentage in a chip; a bar with the pass line
 * drawn ON it; and one sentence about what to do next, in the student's band
 * (`result-band.ts`, which is `/results`'s band, decided by this paper's own
 * verdict). `--ok`/`--err` appear only on the verdict badge — the one licence
 * they have here — and the band is amber under the line, never red.
 *
 * The 2026-10-15 redesign added the percentage, the bar and the banner, which
 * is what the owner asked to keep. What it also added is gone: copy written
 * into the component, a banner that told a student who had PASSED at 60%
 * «لا مش هينفع كده» in red (its cut-offs ignored the pass mark), «فخور بيك»
 * and «عاش يا بطل» (addressed to a boy), six emoji, and a 700ms `width`
 * transition — layout on every frame, past the 400ms motion ceiling.
 *
 * ## Two different screens, decided by `pendingOutOf`
 *
 * On a finished paper this is the mark over the quiz's total, a pass/fail
 * badge, the pass line, and a band.
 *
 * On a paper whose essays are still with the instructor it is deliberately
 * NOT that screen, because that screen lies. `gradeAttempt` counts an ungraded
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

  // The total the headline is over. Not a cosmetic choice — see the header.
  const outOf = pending ? gradedOutOf : gradeOutOf;
  const percent =
    scaledScore !== null && outOf > 0
      ? Math.min(100, Math.max(0, Math.round((scaledScore / outOf) * 100)))
      : null;
  const band = resultBand({ percent, passed, passPercent, outstanding });
  const BandIcon = BAND_ICON[band];

  return (
    <section className="result-card" data-band={band}>
      <div className="result-card__top">
        <p className="eyebrow">{pending ? copy.quiz.pendingEyebrow : copy.quiz.resultsTitle}</p>
        {outstanding ? (
          // Amber, never `ok`/`err`: nothing has been decided yet, and the
          // two colours this screen reserves both read as a decision.
          <span className="verdict verdict--pending">
            <Hourglass className="size-4" aria-hidden="true" />
            {copy.quiz.pendingNotFinal}
          </span>
        ) : passed !== null ? (
          <span className={`verdict verdict--${passed ? 'pass' : 'fail'}`}>
            {passed ? <CircleCheck className="size-4" aria-hidden="true" /> : null}
            {passed ? copy.quiz.passed : copy.quiz.failed}
          </span>
        ) : null}
      </div>

      <div className="result-card__figures">
        <p className="result-card__score">
          <span className="result-card__mark">{scaledScore === null ? '—' : formatMark(scaledScore)}</span>
          <span className="result-card__out-of">/ {formatMark(outOf)}</span>
        </p>
        {percent !== null ? (
          <p className="result-card__pct">
            <span className="result-card__pct-value">{percent}%</span>
            <span className="result-card__pct-label">{x.percentLabel}</span>
          </p>
        ) : null}
      </div>

      {percent !== null ? (
        // Decorative: the figures above ARE the value, in text.
        <div className="result-card__meter" aria-hidden="true">
          <span className="result-card__fill" style={{ transform: `scaleX(${percent / 100})` }} />
          {outstanding ? null : (
            <span
              className="result-card__tick"
              style={{ insetInlineStart: `${Math.min(100, Math.max(0, passPercent))}%` }}
            />
          )}
        </div>
      ) : null}

      {outstanding ? null : (
        <p className="result-card__pass">{isolateLtrRuns(formatCopy(copy.quiz.passMark, { percent: passPercent }))}</p>
      )}

      <div className="result-card__note">
        <span className="result-card__note-well" aria-hidden="true">
          <BandIcon className="size-5" />
        </span>
        <div className="result-card__note-text">
          <p className="result-card__note-title">{x.bands[band].title}</p>
          {band !== 'pending' ? (
            <p className="result-card__note-body">{x.bands[band].body}</p>
          ) : pending ? (
            <>
              {/*
                ⚠️ Both of the pending lines name the marker, and this is the
                screen where that matters most: a student reading «باقي ٥٠
                درجة لسه عند مهندس أيمن بيصحّحها بنفسه» on another instructor's
                platform has been handed a receipt for a paper the named person
                has never seen. `notification-view.ts` reached the same
                conclusion about the NOTIFICATION for this same mark and dropped
                the detail line; here the sentence is the screen, so it is
                swapped rather than dropped.
              */}
              <p className="result-card__note-body">
                {isolateLtrRuns(
                  tenantSentence(formatCopy(copy.quiz.pendingRest, { marks: formatMark(pendingOutOf) })),
                )}
              </p>
              <p className="result-card__note-small">{copy.quiz.pendingWillArrive}</p>
            </>
          ) : (
            <p className="result-card__note-body">{tenantSentence(copy.quiz.essayPending)}</p>
          )}
        </div>
      </div>
    </section>
  );
}
