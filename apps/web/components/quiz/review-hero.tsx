import Image from 'next/image';
import { BookOpen, CircleCheck, Hourglass } from 'lucide-react';
// Subpaths, like `result-header.tsx` beside it — never the root barrel.
import { copy } from '@ayman/contracts/copy';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { formatCopy, formatMark } from '@ayman/contracts/format';
import { isolateLtrRuns } from '@/components/dashboard/ltr-runs';
import type { BrandAsset } from '@/lib/brand-assets';
import { tenantSentence } from '@/lib/tenant-copy';
import { resultBand } from './result-band';

const b = copy.quiz.reviewBoard;

export interface ReviewHeroProps {
  scaledScore: number | null;
  gradeOutOf: number;
  passPercent: number;
  passed: boolean | null;
  /** `questions.some(q => q.correctness === 'needsGrading')` — the fallback evidence, as in `ResultHeader`. */
  needsGrading: boolean;
  /** Marks still with the instructor, out of `gradeOutOf`; `0` on a finished paper. */
  pendingOutOf: number;
  /** What the marked part is worth. */
  gradedOutOf: number;
  /** The quiz's title from `/api/me/quizzes`, or `null` when that read did not answer. */
  title: string | null;
  /** The celebration's backdrop — `getBrandAsset()`, so `undefined` on every stack but his. */
  poster?: BrandAsset;
}

/**
 * The top of «نتيجة الامتحان», in one of three moods — and the mood is the
 * paper's own verdict, decided exactly as `ResultHeader` decides it
 * (`resultBand`), so the two screens can never disagree about one sitting.
 *
 *   · PASSED (`high` / `pass`) — the celebration: confetti drawn inline, the
 *     score as a big orange ring, «نجاح», «برافو!» and the quiz's name.
 *   · UNDER THE LINE (`low`) — calm, no confetti, the ring in amber rather
 *     than red, and a line that says what to do next. A student who has just
 *     failed is the one most likely to close the tab; the screen's job is the
 *     way forward, not a second verdict.
 *   · STILL MARKING (`pending`) — no verdict and no pass line, the mark over
 *     `gradedOutOf`, and the outstanding marks stated as an amount. Every
 *     reason for that split is written up in `result-header.tsx`; this keeps
 *     every one of its rules.
 *
 * The panel is dark in BOTH themes — a result is a moment — so every colour on
 * it is an `--ink*` / brand token or a mix of one (`review-cinema.css`).
 */
export function ReviewHero({
  scaledScore,
  gradeOutOf,
  passPercent,
  passed,
  needsGrading,
  pendingOutOf,
  gradedOutOf,
  title,
  poster,
}: ReviewHeroProps) {
  const pending = pendingOutOf > 0;
  const outstanding = pending || needsGrading;
  const outOf = pending ? gradedOutOf : gradeOutOf;
  const percent =
    scaledScore !== null && outOf > 0
      ? Math.min(100, Math.max(0, Math.round((scaledScore / outOf) * 100)))
      : null;
  const band = resultBand({ percent, passed, passPercent, outstanding });
  const celebrate = band === 'high' || band === 'pass';
  const withPoster = celebrate && poster !== undefined;

  return (
    <section
      className="rvc-hero"
      data-band={band}
      data-poster={withPoster ? '' : undefined}
      aria-labelledby="rvc-hero-title"
    >
      {withPoster ? (
        <>
          <Image
            src={poster.src}
            alt=""
            aria-hidden="true"
            fill
            priority
            sizes="(min-width: 960px) 960px, 100vw"
            className="rvc-hero__poster"
          />
          <span className="rvc-hero__scrim" aria-hidden="true" />
        </>
      ) : null}
      {celebrate ? <Confetti /> : null}

      <div className="rvc-hero__inner">
        <Ring percent={percent} mark={scaledScore} outOf={outOf} />

        <div className="rvc-hero__text">
          {/* «نتيجتك» stays the eyebrow on a final mark: `quiz-attempt-review.e2e.ts`
              reads it to prove the result rendered. */}
          <p className="rvc-hero__eyebrow">{pending ? copy.quiz.pendingEyebrow : copy.quiz.resultsTitle}</p>

          {outstanding ? (
            <span className="rvc-verdict" data-tone="pending">
              <Hourglass className="size-4" aria-hidden="true" />
              {copy.quiz.pendingNotFinal}
            </span>
          ) : passed === true ? (
            <span className="rvc-verdict" data-tone="ok">
              <CircleCheck className="size-4" aria-hidden="true" />
              {copy.quiz.passed}
            </span>
          ) : passed === false ? (
            <span className="rvc-verdict" data-tone="warn">
              <BookOpen className="size-4" aria-hidden="true" />
              {copy.quiz.failed}
            </span>
          ) : null}

          {!celebrate && title ? <p className="rvc-hero__quiz">{title}</p> : null}
          <h2 id="rvc-hero-title" className="rvc-hero__title">
            {celebrate
              ? title
                ? `${b.passedTitle} ${title}`
                : b.passedTitle
              : band === 'pending'
                ? quizExperience.result.bands.pending.title
                : b.lowTitle}
          </h2>

          {band === 'pending' ? (
            pending ? (
              <>
                {/* Names the marker, swapped on every other stack — see the
                    ⚠️ on the same two lines in `result-header.tsx`. */}
                <p className="rvc-hero__line">
                  {isolateLtrRuns(
                    tenantSentence(formatCopy(copy.quiz.pendingRest, { marks: formatMark(pendingOutOf) })),
                  )}
                </p>
                <p className="rvc-hero__small">{copy.quiz.pendingWillArrive}</p>
              </>
            ) : (
              <p className="rvc-hero__line">{tenantSentence(copy.quiz.essayPending)}</p>
            )
          ) : (
            <p className="rvc-hero__line">
              {band === 'high' ? b.highLine : band === 'pass' ? b.passedLine : b.lowLine}
            </p>
          )}

          {outstanding ? null : (
            <p className="rvc-hero__small">
              {isolateLtrRuns(formatCopy(copy.quiz.passMark, { percent: passPercent }))}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The score as a ring, filling from the top toward the inline-start — the
 * RTL direction every meter on this platform reads in. `pathLength="100"`, so
 * the dash IS the percentage. Decorative: the figures in the middle are real
 * text, and they are the whole of what the arc says.
 */
function Ring({ percent, mark, outOf }: { percent: number | null; mark: number | null; outOf: number }) {
  return (
    <div className="rvc-ring">
      <svg viewBox="0 0 172 172" className="rvc-ring__svg" aria-hidden="true" focusable="false">
        <circle cx="86" cy="86" r="72" className="rvc-ring__track" />
        {percent !== null && percent > 0 ? (
          <circle
            cx="86"
            cy="86"
            r="72"
            pathLength={100}
            strokeDasharray={`${percent} 100`}
            className="rvc-ring__arc"
          />
        ) : null}
      </svg>
      <p className="rvc-ring__centre">
        <span className="rvc-ring__pct rvc-ltr">{percent === null ? '—' : `${percent}%`}</span>
        {mark !== null ? (
          <span className="rvc-ring__mark">
            {isolateLtrRuns(formatCopy(b.markOf, { score: formatMark(mark), total: formatMark(outOf) }))}
          </span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * The celebration, drawn — no library, no canvas, nothing that runs. A fixed
 * scatter of paper bits across the top of the panel, each one coloured by a
 * class (`review-cinema.css`) so the brand tokens re-colour it per stack. It
 * falls into place once, and only under `prefers-reduced-motion: no-preference`.
 */
function Confetti() {
  return (
    <svg
      className="rvc-confetti"
      viewBox="0 0 360 200"
      preserveAspectRatio="xMidYMin slice"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="28" y="30" width="10" height="5" rx="1.5" className="rvc-c1" transform="rotate(-30 33 32)" />
      <rect x="70" y="72" width="8" height="4" rx="1.5" className="rvc-c2" transform="rotate(25 74 74)" />
      <rect x="112" y="22" width="12" height="5" rx="1.5" className="rvc-c3" transform="rotate(50 118 24)" />
      <circle cx="150" cy="58" r="3.5" className="rvc-c4" />
      <rect x="188" y="16" width="10" height="5" rx="1.5" className="rvc-c1" transform="rotate(15 193 18)" />
      <rect x="226" y="54" width="9" height="4" rx="1.5" className="rvc-c5" transform="rotate(-45 230 56)" />
      <circle cx="262" cy="26" r="3" className="rvc-c2" />
      <rect x="300" y="64" width="11" height="5" rx="1.5" className="rvc-c4" transform="rotate(35 305 66)" />
      <rect x="330" y="20" width="8" height="4" rx="1.5" className="rvc-c1" transform="rotate(-20 334 22)" />
      <circle cx="46" cy="118" r="3" className="rvc-c3" />
      <rect x="18" y="160" width="10" height="4" rx="1.5" className="rvc-c4" transform="rotate(60 23 162)" />
      <rect x="320" y="128" width="10" height="5" rx="1.5" className="rvc-c1" transform="rotate(-55 325 130)" />
      <circle cx="340" cy="178" r="3.5" className="rvc-c2" />
      <rect x="88" y="132" width="7" height="3.5" rx="1.5" className="rvc-c1" transform="rotate(40 91 134)" />
      <rect x="276" y="104" width="7" height="3.5" rx="1.5" className="rvc-c2" transform="rotate(-15 279 106)" />
      <circle cx="204" cy="92" r="2.5" className="rvc-c1" />
      <path d="M128 100q6-8 12 0t12 0" className="rvc-c4 rvc-curl" />
      <path d="M236 150q6-8 12 0t12 0" className="rvc-c3 rvc-curl" />
    </svg>
  );
}
