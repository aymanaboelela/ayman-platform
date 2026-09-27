'use client';

import { useState } from 'react';
import { cn } from '@ayman/ui/lib/cn';
import { formatAmount, formatCount, shortDay } from './money-format';

export interface StackSeries {
  key: string;
  label: string;
  /** A chart token (`var(--viz-N)` / `var(--viz-muted)`), never a literal. */
  color: string;
}

export interface StackColumn {
  /** `YYYY-MM-DD`. */
  date: string;
  /** The tooltip's heading — «الإتنين 28/09» or «النهارده». */
  title: string;
  /** Per series key; a missing key is zero. */
  values: Readonly<Record<string, number>>;
}

/**
 * Stacked columns over a date range, drawn from HTML boxes like `ColumnChart`
 * — and for the same two reasons: RTL comes free (the oldest day sits at the
 * right, where an Arabic reader starts, exactly like `AreaChart`), and the
 * labels are text in a box rather than SVG `<text>` that cannot wrap.
 *
 * ## Why stacked, and why this many series
 *
 * «كام دخل من الكورس ده والكورس ده» is part-to-whole on every day, and a
 * stacked column answers both halves at once: the height is the day, the
 * segments are the courses. The caller folds everything past the fourth course
 * into one muted «كورسات تانية» segment — a fifth generated hue would be
 * indistinguishable from an existing one under colour-blindness.
 *
 * ## Mark spec
 *
 * A 2px surface gap between segments (it is what separates them — never a
 * stroke), 4px rounding on the data end only, square at the baseline, and the
 * whole column band is the hover target so a near-empty day is still
 * readable. The tooltip lists every non-zero segment, largest first, under the
 * day's total; the legend above is always present, so identity is never
 * colour alone, and `ChartCard` holds the table view.
 *
 * `valueKind` rather than a formatter prop: this is a Client Component mounted
 * from a Server one, and a function cannot cross that boundary (see
 * `AreaChart`'s note on `unit` for what that failure looks like).
 */
export function StackedColumns({
  series,
  columns,
  valueKind,
  height = 192,
  label,
}: {
  series: readonly StackSeries[];
  columns: readonly StackColumn[];
  valueKind: 'money' | 'count';
  height?: number;
  label: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const format = valueKind === 'money' ? formatAmount : formatCount;

  const totals = columns.map((column) =>
    series.reduce((sum, s) => sum + Math.max(0, column.values[s.key] ?? 0), 0),
  );
  const max = Math.max(1, ...totals);
  const n = columns.length;

  // Three ticks — the two ends and the middle. Thirty dates under thirty
  // columns is unreadable on a phone, and the tooltip carries every day.
  const ticks = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : n > 0 ? [0, n - 1] : [];

  return (
    <div className="min-w-0">
      {/* The legend, always — two to six series, never colour alone. */}
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {series.map((s) => (
          <li
            key={s.key}
            className="flex items-center gap-1.5 text-[length:var(--fs-text-xs)] text-fg-muted"
          >
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>

      <div className="relative">
        {/* The scale: the tallest day, printed once at the top of a recessive
            grid line. Enough to read magnitude without a full axis. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line-subtle"
        >
          <span className="tabular absolute -top-2.5 end-0 bg-surface-2 ps-1 text-[length:var(--fs-mono-label)] text-fg-muted">
            {format(max)}
          </span>
        </div>

        <div
          className="flex items-end gap-0.5 border-b border-line pt-3"
          style={{ height }}
          role="group"
          aria-label={label}
        >
          {columns.map((column, index) => {
            const total = totals[index] ?? 0;
            const isActive = active === column.date;
            const parts = series
              .map((s) => ({ ...s, value: Math.max(0, column.values[s.key] ?? 0) }))
              .filter((part) => part.value > 0);
            // Where the tooltip hangs from: the oldest columns sit at the
            // right edge in RTL, so their tooltip opens leftward from the
            // start; today's opens rightward from the end; the rest centre.
            const align =
              index < n * 0.25 ? 'justify-start' : index > n * 0.75 ? 'justify-end' : 'justify-center';

            return (
              <div
                key={column.date}
                className="relative flex h-full min-w-0 flex-1 flex-col justify-end outline-none"
                onPointerEnter={() => setActive(column.date)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(column.date)}
                onBlur={() => setActive(null)}
                tabIndex={0}
                aria-label={`${column.title}: ${format(total)}`}
              >
                {isActive ? (
                  <div
                    className={cn(
                      'pointer-events-none absolute inset-x-0 bottom-full z-10 mb-1 flex',
                      align,
                    )}
                  >
                    <div
                      role="tooltip"
                      className="w-max max-w-72 rounded-md border border-line bg-surface-1 px-2.5 py-1.5 text-[length:var(--fs-text-xs)] shadow-md"
                    >
                      <p className="text-fg-muted">{column.title}</p>
                      <p className="tabular font-semibold text-fg">{format(total)}</p>
                      {parts.length > 1 ? (
                        <ul className="mt-1 flex flex-col gap-0.5 border-t border-line-subtle pt-1">
                          {[...parts]
                            .sort((a, b) => b.value - a.value)
                            .map((part) => (
                              <li key={part.key} className="flex items-center gap-1.5">
                                <span
                                  aria-hidden="true"
                                  className="size-2 shrink-0 rounded-[2px]"
                                  style={{ background: part.color }}
                                />
                                <span className="min-w-0 flex-1 truncate text-fg-muted">{part.label}</span>
                                <span className="tabular text-fg">{format(part.value)}</span>
                              </li>
                            ))}
                        </ul>
                      ) : parts.length === 1 ? (
                        <p className="text-fg-muted">{parts[0]!.label}</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div
                  aria-hidden="true"
                  className={cn(
                    'mx-auto flex w-full max-w-7 flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]',
                    'transition-[filter] duration-[160ms] ease-out',
                    isActive && 'brightness-110',
                  )}
                  style={{
                    height: `${total > 0 ? Math.max((total / max) * 100, 2) : 0}%`,
                  }}
                >
                  {parts.map((part) => (
                    <div
                      key={part.key}
                      className="min-h-[2px] w-full"
                      style={{ flex: `${part.value} 0 0`, background: part.color }}
                    />
                  ))}
                </div>

                {/* Today, marked under its own column — the one day he reads
                    first, and the one nearest the start of nothing. */}
                {index === n - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[5px] mx-auto size-1.5 rounded-full bg-accent"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Three ticks in a justified row rather than under their own columns:
          a label centred under a 6px column overflows the card on a phone. In
          RTL the first child sits at the right — the oldest day, like the
          columns above it. */}
      <div className="mt-2 flex justify-between text-[length:var(--fs-mono-label)] text-fg-muted tabular-nums">
        {ticks.map((index) => (
          <span key={index}>{shortDay(columns[index]!.date)}</span>
        ))}
      </div>
    </div>
  );
}
