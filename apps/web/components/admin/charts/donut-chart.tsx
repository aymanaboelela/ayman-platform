'use client';

import { useState } from 'react';
import { cn } from '@ayman/ui/lib/cn';
import { num, pct } from './format';

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

const SIZE = 168;
const RADIUS = 68;
const STROKE = 22;
/** The gap between neighbouring arcs, in degrees at this radius — the surface
 *  doing the separating, per the mark spec. Never a stroke around the arc:
 *  that adds ink that is not data. */
const GAP_DEGREES = 2;

function polar(angleDegrees: number, radius: number): [number, number] {
  const radians = ((angleDegrees - 90) * Math.PI) / 180;
  return [SIZE / 2 + radius * Math.cos(radians), SIZE / 2 + radius * Math.sin(radians)];
}

function arcPath(startDeg: number, endDeg: number, radius: number): string {
  const [x1, y1] = polar(startDeg, radius);
  const [x2, y2] = polar(endDeg, radius);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
}

/**
 * A donut for part-to-whole, with the total as a hero figure in the hole.
 *
 * ## Why a donut is allowed here at all
 *
 * Part-to-whole normally wants a stacked bar; a pie is the default punchline
 * of every chart-criticism post. It earns its place in exactly this case: four
 * or fewer mutually exclusive segments that provably SUM to a whole the reader
 * already has in mind (the eligible cohort), where the question is "roughly
 * what fraction", not "which is bigger by how much". The hole then does real
 * work — it holds the denominator, which is the number that makes every slice
 * interpretable.
 *
 * Past four slices this stops being true. Fold the tail into «غير ذلك».
 *
 * ## The secondary channels are mandatory
 *
 * The categorical palette's first four slots clear the colour-blind floor but
 * sit in the band that is legal only WITH a non-colour channel. So: a legend
 * is always drawn, each slice's percentage is direct-labelled beside its
 * legend entry, and `ChartCard` carries the table view. Removing any of the
 * three breaks the palette's contract, not just the taste of it.
 */
export function DonutChart({
  slices,
  total,
  totalLabel,
}: {
  slices: readonly Slice[];
  total: number;
  totalLabel: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const sum = slices.reduce((acc, slice) => acc + slice.value, 0);
  const drawn = slices.filter((slice) => slice.value > 0);

  // A single slice covering the whole ring has no neighbour to be separated
  // from, and trimming it by the gap would leave a notch that reads as a
  // missing 2%.
  const gap = drawn.length > 1 ? GAP_DEGREES : 0;
  // The running offset is derived from the slices BEFORE this one rather than
  // carried in a mutable cursor: React Compiler rejects reassigning a variable
  // across a render, and the closed form is the same arithmetic anyway.
  const arcs = drawn.map((slice, index) => {
    const before = drawn.slice(0, index).reduce((acc, other) => acc + other.value, 0);
    const start = (before / Math.max(1, sum)) * 360;
    const sweep = (slice.value / Math.max(1, sum)) * 360;
    return {
      ...slice,
      start: start + gap / 2,
      end: Math.max(start + gap / 2, start + sweep - gap / 2),
    };
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={totalLabel}
          /* The ring is drawn clockwise from 12 o'clock, which in an RTL
             document reads as "starting at the top and moving toward the
             reader's leading edge". The legend below is the authoritative
             order; the ring only has to be consistent with it. */
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--viz-track)"
            strokeWidth={STROKE}
          />
          {arcs.map((arc) => (
            <path
              key={arc.key}
              d={arcPath(arc.start, arc.end, RADIUS)}
              fill="none"
              stroke={arc.color}
              strokeWidth={STROKE}
              strokeLinecap="butt"
              className={cn(
                'transition-[opacity] duration-[160ms] ease-out',
                active !== null && active !== arc.key && 'opacity-35',
              )}
              onPointerEnter={() => setActive(arc.key)}
              onPointerLeave={() => setActive(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[length:var(--fs-title-2)] font-semibold leading-none text-fg">
            {num(total)}
          </span>
          <span className="mt-1 max-w-24 text-[length:var(--fs-text-xs)] leading-tight text-fg-muted">
            {totalLabel}
          </span>
        </div>
      </div>

      {/* The legend IS the labelling channel here — a percentage inside a 2%
          arc would be clipped, and the mark spec forbids cropping a label to
          make it fit. */}
      <ul className="flex w-full min-w-0 flex-col gap-2">
        {slices.map((slice) => (
          <li
            key={slice.key}
            className={cn(
              'flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-[160ms] ease-out',
              active === slice.key && 'bg-surface-3',
            )}
            onPointerEnter={() => setActive(slice.key)}
            onPointerLeave={() => setActive(null)}
          >
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-xs"
              style={{ background: slice.color }}
            />
            <span className="min-w-0 grow truncate text-[length:var(--fs-text-sm)] text-fg-muted">
              {slice.label}
            </span>
            <span className="tabular shrink-0 text-[length:var(--fs-text-sm)] font-medium text-fg">
              {num(slice.value)}
            </span>
            <span className="tabular w-12 shrink-0 text-end text-[length:var(--fs-text-xs)] text-fg-muted">
              {sum > 0 ? pct(slice.value / sum) : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
