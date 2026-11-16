import Image from 'next/image';
import { Hourglass } from 'lucide-react';
import {
  copy,
  formatCopy,
  type QuizHistoryPoint,
  type QuizHistoryRow,
  type StudentQuizHistory,
} from '@ayman/contracts';
import type { BrandAsset } from '@/lib/brand-assets';
import { formatDay, hasPendingMarks, resultsMood, scoreBand } from '@/lib/results-view';
import { IsolatedFigures } from './isolated-figures';

const c = copy.results;

/** The bars stop being readable at a phone's width past this many. */
const MAX_BARS = 8;

/**
 * The top of `/results` — the 2026-11 board: where the student stands, and
 * which way it is going, on one dark panel.
 *
 *   · the AVERAGE as an orange ring, the one figure the page is about;
 *   · one sentence that adds the numbers up (`resultsMood` — a real climb is
 *     named with its figures, a low average gets the way forward);
 *   · three supporting facts, small: exams sat, exams passed, attempts.
 *     `statQuizzes` and `statAttempts` keep their exact labels —
 *     `student-results.e2e.ts` reads them to prove the summary rendered;
 *   · the last sittings as a row of bars, oldest at the inline-start's far
 *     side (the right), newest — orange — at the left, the direction time
 *     runs on every chart here. A paper under its own pass mark is the one
 *     red bar, decided by `passed`, never by a percentage.
 *
 * The board's «↑ ١٢٪ عن الشهر اللي فات» chip is not drawn: the payload has
 * no month-over-month figure, and the mood sentence already names a climb
 * when there is one, with its real numbers.
 *
 * Dark in BOTH themes — a results screen is a moment — so every colour on it
 * is an `--ink*` / brand token or a mix of one (`results.css`).
 */
export function ResultsHero({
  summary,
  series,
  rows,
  poster,
}: {
  summary: StudentQuizHistory['summary'];
  series: readonly QuizHistoryPoint[];
  rows: readonly QuizHistoryRow[];
  /** `getBrandAsset()` — `undefined` on every stack but his, and the panel is its gradient. */
  poster?: BrandAsset;
}) {
  const band = summary.averagePercent === null ? null : scoreBand(summary.averagePercent);
  const mood = resultsMood(summary, series);
  const pending = hasPendingMarks(rows);
  const bars = series.slice(-MAX_BARS);

  return (
    <section
      className="rs-hero"
      data-band={band ?? 'none'}
      data-poster={poster ? '' : undefined}
      aria-labelledby="rs-hero-title"
    >
      {poster ? (
        <>
          <Image
            src={poster.src}
            alt=""
            aria-hidden="true"
            fill
            priority
            sizes="(min-width: 1024px) 1100px, 100vw"
            className="rs-hero__poster"
          />
          <span className="rs-hero__scrim" aria-hidden="true" />
        </>
      ) : null}

      <div className="rs-hero__main">
        <div className="rs-hero__head">
          <AverageRing percent={summary.averagePercent} />
          <div className="rs-hero__words">
            <h2 id="rs-hero-title" className="rs-hero__title">
              {c.statAverage}
            </h2>
            <p className="rs-hero__mood">
              <IsolatedFigures text={formatCopy(c[mood.key], mood.vars)} />
            </p>
            {pending ? (
              <p className="rs-hero__note">
                <Hourglass className="size-4 shrink-0" aria-hidden="true" />
                {c.pendingNote}
              </p>
            ) : null}
          </div>
        </div>

        <dl className="rs-facts">
          <Fact label={c.statQuizzes} value={summary.quizzesTaken} />
          <Fact label={c.statPassed} value={summary.passedCount} />
          <Fact label={c.statAttempts} value={summary.attemptsTotal} />
        </dl>
      </div>

      {bars.length > 0 ? (
        <div className="rs-hero__bars">
          <p className="rs-bars__title" aria-hidden="true">
            {c.barsTitle}
          </p>
          <div
            className="rs-bars"
            role="img"
            aria-label={formatCopy(c.barsLabel, {
              count: bars.length,
              scores: bars.map((point) => `${point.scorePercent}%`).join('، '),
            })}
          >
            {bars.map((point, index) => (
              <span
                key={point.attemptId}
                className="rs-bar"
                data-state={point.passed === null ? 'pending' : point.passed ? 'passed' : 'failed'}
                data-latest={index === bars.length - 1 ? '' : undefined}
              >
                <b className="rs-ltr">{point.scorePercent}</b>
                {/* A floor of 4%, so a 0 is still a visible stub, not nothing. */}
                <i style={{ blockSize: `${Math.max(point.scorePercent, 4)}%` }} />
                <span className="rs-bar__date">{formatDay(point.submittedAt)}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    // `dt` first, as a `<dl>` requires; the CSS stacks the value on top.
    <div className="rs-fact">
      <dt className="rs-fact__label">{label}</dt>
      <dd className="rs-fact__value rs-ltr">{value}</dd>
    </div>
  );
}

/**
 * The average as a ring — `pathLength="100"`, so the dash IS the percentage —
 * filling from the top toward the inline-start. The figure in the middle is
 * real text and the whole of what the arc says, so the drawing is hidden.
 */
function AverageRing({ percent }: { percent: number | null }) {
  const value = percent === null ? null : Math.min(Math.max(Math.round(percent), 0), 100);
  return (
    <div className="rs-ring">
      <svg viewBox="0 0 116 116" className="rs-ring__svg" aria-hidden="true" focusable="false">
        <circle cx="58" cy="58" r="50" className="rs-ring__track" />
        {value !== null && value > 0 ? (
          <circle cx="58" cy="58" r="50" pathLength={100} strokeDasharray={`${value} 100`} className="rs-ring__arc" />
        ) : null}
      </svg>
      <p className="rs-ring__centre">
        <span className="rs-ring__num rs-ltr">{value === null ? c.noneYet : `${value}%`}</span>
        <span className="rs-ring__label">{c.ringLabel}</span>
      </p>
    </div>
  );
}
