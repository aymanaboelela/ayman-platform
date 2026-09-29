import type { ReactNode } from 'react';
import { Award, ClipboardList, Hourglass, Repeat2, Sparkles, Trophy } from 'lucide-react';
import {
  copy,
  formatCopy,
  type QuizHistoryPoint,
  type QuizHistoryRow,
  type StudentQuizHistory,
} from '@ayman/contracts';
import { hasPendingMarks, resultsMood, scoreBand, type ScoreBand } from '@/lib/results-view';
import { IsolatedFigures } from './isolated-figures';
import { ScoreGauge } from './score-gauge';

const c = copy.results;

const BAND_LABEL: Record<ScoreBand, string> = {
  high: c.bandHigh,
  pass: c.bandPass,
  low: c.bandLow,
};

/** Past this many exams the pips stop being countable at a glance and become a bar. */
const MAX_PIPS = 12;

/**
 * The top of `/results`: where the student stands, in one panel.
 *
 * It replaced four identical grey tiles in a row — «امتحانات دخلتها ٣ · عدد
 * محاولاتك ٣ · متوسط درجاتك ١٨٪ · ٠/٣» — which gave the average, the one
 * figure the page is about, exactly the same weight as a count of attempts.
 * Now the average is the gauge, its band is named under it, one sentence says
 * what the numbers add up to, and the other four figures sit beside it as
 * supporting facts.
 *
 * The panel is dark in BOTH themes, like the dashboard's ember band and the
 * rank hero — a results screen is a moment, and a moment is a lit stage, not
 * another card on the page. Every colour on it is a token or a mix of one
 * (`results.css`), so another teacher's stack re-colours with its brand.
 *
 * `statQuizzes` and `statAttempts` keep their exact labels: `student-results.e2e.ts`
 * reads them to prove the summary rendered.
 */
export function ResultsHero({
  summary,
  series,
  rows,
}: {
  summary: StudentQuizHistory['summary'];
  series: readonly QuizHistoryPoint[];
  rows: readonly QuizHistoryRow[];
}) {
  const band = summary.averagePercent === null ? null : scoreBand(summary.averagePercent);
  const mood = resultsMood(summary, series);
  const pending = hasPendingMarks(rows);
  const passedShare = summary.quizzesTaken > 0 ? summary.passedCount / summary.quizzesTaken : 0;

  return (
    <section className="rs-hero" data-band={band ?? 'none'} aria-label={c.statAverage}>
      <div className="rs-hero__grid">
        <div className="rs-hero__gauge">
          <ScoreGauge percent={summary.averagePercent} band={band} label={c.statAverage} />
          {band ? (
            <span className="rs-band" data-band={band}>
              {band === 'high' ? (
                <Sparkles className="size-3.5" aria-hidden="true" />
              ) : (
                <span className="rs-band__dot" aria-hidden="true" />
              )}
              {BAND_LABEL[band]}
            </span>
          ) : null}
        </div>

        <div className="rs-hero__body">
          <p className="rs-hero__mood">
            <IsolatedFigures text={formatCopy(c[mood.key], mood.vars)} />
          </p>
          {pending ? (
            <p className="rs-hero__note">
              <Hourglass className="size-4 shrink-0" aria-hidden="true" />
              {c.pendingNote}
            </p>
          ) : null}

          <ul className="rs-stats">
            <Stat
              hue="pass"
              icon={<Award className="size-4" />}
              label={c.statPassed}
              meter={
                // Decorative: the figure above IS the value, in text. One pip
                // per exam while they can still be counted at a glance.
                summary.quizzesTaken <= MAX_PIPS ? (
                  <span className="rs-pips" aria-hidden="true">
                    {Array.from({ length: summary.quizzesTaken }, (_, index) => (
                      <i key={index} data-on={index < summary.passedCount ? '' : undefined} />
                    ))}
                  </span>
                ) : (
                  <span className="rs-meter" aria-hidden="true">
                    <i style={{ inlineSize: `${passedShare * 100}%` }} />
                  </span>
                )
              }
            >
              <span aria-hidden="true" className="rs-ltr">
                {summary.passedCount}
                <span className="rs-stat__of">/{summary.quizzesTaken}</span>
              </span>
              <span className="sr-only">
                {formatCopy(c.attemptsOf, { used: summary.passedCount, max: summary.quizzesTaken })}
              </span>
            </Stat>
            <Stat hue="blue" icon={<ClipboardList className="size-4" />} label={c.statQuizzes}>
              {summary.quizzesTaken}
            </Stat>
            <Stat hue="teal" icon={<Repeat2 className="size-4" />} label={c.statAttempts}>
              {summary.attemptsTotal}
            </Stat>
            <Stat hue="gold" icon={<Trophy className="size-4" />} label={c.statBest}>
              {summary.bestPercent === null ? (
                c.noneYet
              ) : (
                <span className="rs-ltr">
                  {summary.bestPercent}
                  <span className="rs-stat__of">%</span>
                </span>
              )}
            </Stat>
          </ul>
        </div>
      </div>
    </section>
  );
}

/**
 * One supporting figure — the value, then its label, which is also the order
 * a screen reader meets them in («٣ امتحانات اتقدّمت»). The icon well carries a hue per KIND of number — the
 * same idea as `StatTile`'s wells, drawn on the ink panel's white alphas
 * instead of the page's neutrals, because every neutral in this product
 * inverts between themes and this panel does not.
 */
function Stat({
  hue,
  icon,
  label,
  meter,
  children,
}: {
  hue: 'pass' | 'blue' | 'teal' | 'gold';
  icon: ReactNode;
  label: string;
  meter?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="rs-stat" data-hue={hue}>
      <span className="rs-stat__well" aria-hidden="true">
        {icon}
      </span>
      <span className="rs-stat__value">{children}</span>
      <span className="rs-stat__label">{label}</span>
      {meter}
    </li>
  );
}
