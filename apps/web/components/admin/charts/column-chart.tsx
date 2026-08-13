'use client';

import { useState } from 'react';
import { cn } from '@ayman/ui/lib/cn';
import { num } from './format';

export interface Column {
  key: string;
  /** The axis tick under the column. Kept short — this axis has no room. */
  label: string;
  value: number;
  color: string;
  /** What the tooltip says. Falls back to `label`. */
  tooltip?: string;
}

/**
 * A column chart built from HTML boxes, not SVG.
 *
 * Two reasons, and the second is the real one:
 *
 *   - **RTL comes free.** A flex row in an `dir="rtl"` document lays its
 *     children out right-to-left with no work, so bucket 1 sits on the right
 *     where an Arabic reader starts. An SVG would need every x coordinate
 *     mirrored and every `<text>` un-mirrored, and the first person to add a
 *     series would get it wrong.
 *   - **The labels reflow.** Axis text in SVG cannot wrap or ellipsize; here
 *     it is just text in a box and the browser handles a long month name.
 *
 * Mark spec, per the house rules: caps at 24px so the band keeps some air,
 * 4px rounded at the data end and square at the baseline, and a 2px gap in the
 * surface colour between neighbours — the gap is what separates them, never a
 * stroke.
 */
export function ColumnChart({
  columns,
  height = 176,
  valueFormatter = (value: number) => num(value),
}: {
  columns: readonly Column[];
  height?: number;
  valueFormatter?: (value: number) => string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...columns.map((column) => column.value));

  return (
    <div className="min-w-0">
      <div
        className="flex items-end gap-0.5 border-b border-line"
        style={{ height }}
        role="group"
      >
        {columns.map((column) => {
          const share = column.value / max;
          const isActive = active === column.key;
          return (
            <div
              key={column.key}
              className="relative flex h-full min-w-0 flex-1 flex-col justify-end"
              onPointerEnter={() => setActive(column.key)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(column.key)}
              onBlur={() => setActive(null)}
              tabIndex={0}
              /* The whole band is the hit target, not just the painted bar —
                 a 3px-tall column for a near-empty bucket is unhoverable
                 otherwise, and the empty buckets are the ones worth reading. */
            >
              {isActive ? (
                <div
                  role="tooltip"
                  className={cn(
                    'pointer-events-none absolute bottom-full z-10 mb-1 w-max max-w-40 -translate-x-1/2 rounded-md',
                    'border border-line bg-surface-1 px-2 py-1 text-[length:var(--fs-text-xs)] shadow-md',
                    'start-1/2',
                  )}
                >
                  <span className="block text-fg-muted">{column.tooltip ?? column.label}</span>
                  <span className="tabular block font-medium text-fg">
                    {valueFormatter(column.value)}
                  </span>
                </div>
              ) : null}
              <div
                aria-hidden="true"
                className={cn(
                  'mx-auto w-full max-w-6 rounded-t-[4px] transition-[filter] duration-[160ms] ease-out',
                  isActive && 'brightness-110',
                )}
                style={{
                  height: `${Math.max(share * 100, column.value > 0 ? 2 : 0)}%`,
                  background: column.color,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-0.5">
        {columns.map((column) => (
          <span
            key={column.key}
            className="mono min-w-0 flex-1 truncate text-center text-[length:var(--fs-mono-label)] tabular-nums text-fg-muted"
          >
            {column.label}
          </span>
        ))}
      </div>
    </div>
  );
}
