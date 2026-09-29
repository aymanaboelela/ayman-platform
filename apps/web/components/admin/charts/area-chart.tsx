'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@ayman/ui/lib/cn';
import { num, shortDate } from './format';

export interface Point {
  date: string;
  value: number;
  /**
   * The x label, when the axis is not a calendar — the retention curve's
   * «عند ٢٥٪ من الفيديو». Omitted, the chart reads `date` as `YYYY-MM-DD`.
   * A string per point, not a formatter: see `unit` for why no function may
   * cross into this component.
   */
  label?: string;
  /** The tooltip's value, already formatted — overrides `value` + `unit`. */
  display?: string;
}

const HEIGHT = 180;
const PAD_TOP = 12;
const PAD_BOTTOM = 22;
const VIEW_WIDTH = 720;

/**
 * A single-series area chart over a date range, with a crosshair.
 *
 * ## The time axis runs right-to-left
 *
 * The oldest day sits at the RIGHT edge and today at the left, because this
 * product is RTL natively rather than an LTR layout with the text flipped
 * (see the repo README). In an Arabic document the eye enters at the right, so
 * a left-to-right time axis makes the reader travel backwards through time to
 * read forwards through the page. Everything downstream follows from this one
 * decision: `xFor` subtracts.
 *
 * ## One series, one axis
 *
 * There is deliberately no second series and no second scale. Watch-minutes
 * and attempt-counts are different units, and a dual axis makes their crossing
 * point look meaningful when it is an artefact of two arbitrary scalings. Two
 * measures over the same range means two of these, stacked.
 */
export function AreaChart({
  points,
  color = 'var(--viz-1)',
  valueLabel,
  unit,
}: {
  points: readonly Point[];
  color?: string;
  valueLabel: string;
  /**
   * A suffix for the tooltip value — «د», «س». A STRING, deliberately, not a
   * `(value: number) => string`.
   *
   * Every page that mounts this chart is a Server Component, and a function
   * prop cannot cross that boundary: React throws "Functions cannot be passed
   * directly to Client Components" while SERIALISING the tree, which fails the
   * page's JS chunk rather than the render. The browser then 500s on a
   * `/_next/static/chunks/*.js` request and the page shows an unhydrated
   * shell — a symptom that points nowhere near the actual cause. `next dev`
   * never surfaced it; only the production build did.
   */
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (points.length < 2) return null;

  const max = Math.max(1, ...points.map((point) => point.value));
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const step = VIEW_WIDTH / (points.length - 1);

  const xFor = (index: number) => VIEW_WIDTH - index * step;
  const yFor = (value: number) => PAD_TOP + plotHeight - (value / max) * plotHeight;

  const line = points.map((point, index) => `${xFor(index)},${yFor(point.value)}`).join(' ');
  const area = `${xFor(0)},${PAD_TOP + plotHeight} ${line} ${xFor(points.length - 1)},${PAD_TOP + plotHeight}`;

  function onMove(event: ReactPointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Ratio within the box, then inverted — the same right-to-left mapping
    // `xFor` uses. Reading the client x directly would put the crosshair on
    // the mirror-image day.
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.round((1 - ratio) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, index)));
  }

  const active = hover === null ? null : points[hover];
  const gridLines = [0, 0.5, 1];

  return (
    <div className="relative min-w-0">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-44 w-full touch-none"
        role="img"
        aria-label={valueLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {gridLines.map((ratio) => (
          <line
            key={ratio}
            x1={0}
            x2={VIEW_WIDTH}
            y1={PAD_TOP + plotHeight * ratio}
            y2={PAD_TOP + plotHeight * ratio}
            stroke="var(--viz-grid)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* ~10% wash, never a saturated block: the fill is context for the
            line, and a solid one competes with it for the reader's eye. */}
        <polygon points={area} fill={color} opacity={0.1} />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {hover !== null ? (
          <>
            <line
              x1={xFor(hover)}
              x2={xFor(hover)}
              y1={PAD_TOP}
              y2={PAD_TOP + plotHeight}
              stroke="var(--viz-axis)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {/* The surface ring is what keeps the dot legible where it sits on
                the line — and it is part of the hit target, not decoration. */}
            <circle
              cx={xFor(hover)}
              cy={yFor(points[hover]!.value)}
              r={5}
              fill={color}
              stroke="var(--n-2)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
      </svg>

      {/* Two ticks only — the ends. A 90-point axis with every date on it is
          unreadable, and the crosshair carries the rest.

          The FIRST point's label is the first child, because in an RTL row the
          first child is the one on the right — where `xFor(0)` draws it. The
          two were the other way round, so the axis named the newest day under
          the oldest bar (measured in Chrome: first flex child at x=1188 of a
          right-aligned row, the second at 800). */}
      <div className="mt-1 flex justify-between text-[length:var(--fs-mono-label)] text-fg-muted">
        <span className="tabular">{xLabel(points[0]!)}</span>
        <span className="tabular">{xLabel(points.at(-1)!)}</span>
      </div>

      {active ? (
        <div
          role="tooltip"
          className={cn(
            'pointer-events-none absolute top-0 z-10 w-max rounded-md border border-line bg-surface-1',
            'px-2 py-1 text-[length:var(--fs-text-xs)] shadow-md',
          )}
          style={{
            // Point i sits i/(n−1) of the width in from the RIGHT edge
            // (`xFor`), and in RTL the right edge is inline-START. This was
            // `insetInlineEnd` — the LEFT edge in RTL — which put the tooltip
            // for the oldest day over the newest one. `translateX(50%)` then
            // centres the box on the crosshair (its right edge sits on it).
            insetInlineStart: `${(hover! / (points.length - 1)) * 100}%`,
            transform: 'translateX(50%)',
          }}
        >
          <span className="block text-fg-muted">{xLabel(active)}</span>
          <span className="tabular block font-medium text-fg">
            {active.display ?? (unit ? `${num(active.value)} ${unit}` : num(active.value))}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function xLabel(point: Point): string {
  return point.label ?? shortDate(point.date);
}
