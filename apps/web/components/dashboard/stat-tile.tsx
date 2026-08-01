import type { ReactNode } from 'react';
import { cn } from '@ayman/ui';

/**
 * One number and its label. Four of these open the dashboard.
 *
 * The value is `.tabular` because these sit in a row and change between
 * renders — proportional digits make the tiles jitter relative to each other
 * as a student's numbers grow. `--fs-title-1` on a 2-digit number and on a
 * 3-digit one has to occupy the same advance width or the row is never still.
 */
export function StatTile({
  icon,
  value,
  label,
  suffix,
  className,
}: {
  icon: ReactNode;
  value: string | number;
  label: string;
  suffix?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-4',
        'transition-colors duration-[160ms] ease-out hover:border-line-strong',
        className,
      )}
    >
      <span
        className="flex size-8 items-center justify-center rounded-md bg-[color-mix(in_oklch,var(--a-9),transparent_88%)] text-accent-text"
        aria-hidden="true"
      >
        {icon}
      </span>

      <span className="flex items-baseline gap-1">
        <span className="tabular text-[length:var(--fs-title-1)] font-semibold leading-none text-fg">
          {value}
        </span>
        {suffix ? (
          <span className="text-[length:var(--fs-text-sm)] text-fg-muted">{suffix}</span>
        ) : null}
      </span>

      <span className="text-[length:var(--fs-text-sm)] text-fg-muted">{label}</span>
    </div>
  );
}
