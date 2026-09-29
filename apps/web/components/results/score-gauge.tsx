import {
  EXCELLENT_PERCENT,
  PASS_LINE_PERCENT,
  gaugeArcPath,
  gaugePoint,
  type ScoreBand,
} from '@/lib/results-view';

/** The gauge's own coordinate space. Not pixels — the `<svg>` scales via CSS. */
const SIZE = 200;
const STROKE = 16;
/** Room outside the arc for the two tick labels, so they sit inside the box. */
const RADIUS = SIZE / 2 - STROKE / 2 - 16;
const ARC = gaugeArcPath(SIZE, RADIUS);

/**
 * The average, as a 270° gauge with the two lines that matter marked on it.
 *
 * ## Why a gauge and not another ring
 *
 * `ProgressRing` is progress — "how far through", amber, no thresholds. An
 * average is a READING against two lines: the default pass mark and the
 * «امتياز» line. A gauge can carry both as ticks on the arc itself, so a
 * student sees where 18% sits relative to 50 without a legend, and the gap at
 * the bottom is where the label goes.
 *
 * ## Colour is the band, and the band is not a verdict
 *
 * `data-band` picks the arc's colour in `results.css`: amber below the line,
 * green above it, violet from «امتياز» up. Amber, not red, for the low band —
 * this is an average across every exam, not a failed paper, and the
 * per-exam cards are where a real fail is stated.
 *
 * ## Motion
 *
 * The arc sweeps in once on load — the page's one orchestrated moment — and
 * only under `prefers-reduced-motion: no-preference`. Without it the arc is
 * simply drawn at its value; nothing waits on the animation.
 *
 * `aria-hidden` on the drawing: the number in the middle is real text outside
 * the `<svg>`, and it is the whole of what the arc says.
 */
export function ScoreGauge({
  percent,
  band,
  label,
  tone = 'ink',
}: {
  /** `null` draws the empty track — the empty state's preview of the page. */
  percent: number | null;
  band: ScoreBand | null;
  label: string;
  /** `ink` on the hero (dark in both themes), `surface` on a plain card. */
  tone?: 'ink' | 'surface';
}) {
  const value = percent === null ? null : Math.min(Math.max(Math.round(percent), 0), 100);

  return (
    <div className="rs-gauge" data-band={band ?? undefined} data-tone={tone}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="rs-gauge__svg"
        aria-hidden="true"
        focusable="false"
      >
        <path d={ARC} pathLength={100} className="rs-gauge__track" strokeWidth={STROKE} />
        {/* A 0% arc with a round cap is still a dot — drawn as nothing instead,
            so "zero" and "a sliver" do not look the same. */}
        {value !== null && value > 0 ? (
          <path
            d={ARC}
            pathLength={100}
            className="rs-gauge__arc"
            strokeWidth={STROKE}
            strokeDasharray={`${value} 100`}
          />
        ) : null}

        {[PASS_LINE_PERCENT, EXCELLENT_PERCENT].map((tick) => {
          const t = tick / 100;
          const inner = gaugePoint(t, SIZE, RADIUS - STROKE / 2 - 3);
          const outer = gaugePoint(t, SIZE, RADIUS + STROKE / 2 + 3);
          const text = gaugePoint(t, SIZE, RADIUS + STROKE / 2 + 11);
          return (
            <g key={tick} className="rs-gauge__tick">
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />
              <text x={text.x} y={text.y} textAnchor="middle" dominantBaseline="middle">
                {tick}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="rs-gauge__centre">
        <span className="rs-gauge__reading">
          <span className="rs-gauge__num">{value ?? '—'}</span>
          {value === null ? null : <span className="rs-gauge__pct">%</span>}
        </span>
        <span className="rs-gauge__label">{label}</span>
      </p>
    </div>
  );
}
