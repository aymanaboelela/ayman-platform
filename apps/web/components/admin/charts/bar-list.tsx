'use client';

import { cn } from '@ayman/ui/lib/cn';

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Rendered at the bar's tip. Already formatted — this component never
   *  decides how a number reads. */
  display: string;
  color: string;
  /** Optional second line under the label, for the measure the bar is NOT
   *  encoding (a mean score beside a headcount). */
  meta?: string;
  href?: string;
}

/**
 * Horizontal bars, one per named category.
 *
 * The form for "compare magnitude across things with long names" — the
 * governorate breakdown, the year split. A column chart cannot hold «الإسكندرية»
 * under a 40px-wide band, and rotating axis labels to fit is the classic
 * anti-pattern: it makes the reader tilt their head to read a name that had
 * room all along in the other direction.
 *
 * Bars grow from the INLINE START, so in RTL they grow leftward from the right
 * edge — the direction an Arabic reader's eye already travels.
 */
export function BarList({ rows, ariaLabel }: { rows: readonly BarRow[]; ariaLabel?: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <ul className="flex flex-col gap-2.5" aria-label={ariaLabel}>
      {rows.map((row) => {
        const content = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[length:var(--fs-text-sm)] text-fg">
                {row.label}
              </span>
              <span className="tabular shrink-0 text-[length:var(--fs-text-sm)] font-medium text-fg">
                {row.display}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--viz-track)]">
              <div
                className="h-full rounded-full transition-[width] duration-[320ms] ease-out"
                style={{
                  width: `${Math.max((row.value / max) * 100, row.value > 0 ? 2 : 0)}%`,
                  background: row.color,
                }}
              />
            </div>
            {row.meta ? (
              <span className="mt-1 block text-[length:var(--fs-text-xs)] text-fg-muted">
                {row.meta}
              </span>
            ) : null}
          </>
        );

        return (
          <li key={row.key}>
            {row.href ? (
              <a
                href={row.href}
                className={cn(
                  'block rounded-md p-1 -m-1 transition-colors duration-[160ms] ease-out',
                  'hover:bg-surface-3',
                )}
              >
                {content}
              </a>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}
