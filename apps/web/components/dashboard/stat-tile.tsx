import type { ReactNode } from 'react';
import { cn } from '@ayman/ui';

/**
 * One number and its label. Four of these sit under the dashboard's hero.
 *
 * ## What changed, and why
 *
 * These used to open with a 32px accent-tinted chip behind the icon. Four of
 * them in a row read as four unexplained orange squares — the loudest thing on
 * a page whose actual primary action (resume, or the first-run card) sits
 * above them and has to win. The icon is now `fg-faint` at the tile's inline
 * end, subordinate to the number it annotates, and accent survives on this
 * page in exactly two places: the hero's CTA, and the meter below.
 *
 * ## The meter
 *
 * Optional, and supplied only where a fraction is genuinely meaningful —
 * lessons completed, overall progress. It is NOT drawn for "courses enrolled"
 * (a count with no denominator) or "average score" (an average, not a share of
 * anything). A meter under a number that has no whole is a bar the student
 * cannot interpret, and four bars where two are meaningless devalues the two
 * that are.
 *
 * The value is `.tabular` because these sit in a row and change between
 * renders — proportional digits make the tiles jitter relative to each other
 * as a student's numbers grow.
 */
export function StatTile({
  icon,
  value,
  label,
  suffix,
  meterPercent,
  className,
}: {
  icon: ReactNode;
  value: string | number;
  label: string;
  suffix?: string;
  /** 0–100. Omit where the number is not a share of a whole. */
  meterPercent?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // `.panel` carries the shape, the fill, the lit top edge and the
        // hover — see `globals.css`. Before it, this was a hairline rectangle
        // with no way to read as raised in dark mode, and four of them in a
        // row looked like a table header.
        'panel flex flex-col gap-3 p-4',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-baseline gap-1">
          <span className="tabular text-[length:var(--fs-title-1)] font-semibold leading-none text-fg">
            {value}
          </span>
          {suffix ? (
            <span className="text-[length:var(--fs-text-sm)] text-fg-muted">{suffix}</span>
          ) : null}
        </span>

        <span className="shrink-0 text-fg-faint" aria-hidden="true">
          {icon}
        </span>
      </div>

      <span className="text-[length:var(--fs-text-sm)] text-fg-muted">{label}</span>

      {meterPercent === undefined ? null : (
        // Decorative: the number above IS the value, stated in text. A
        // `progressbar` role here would announce the same figure a second time
        // with no extra meaning.
        <span
          className="h-[3px] w-full overflow-hidden rounded-full bg-surface-4"
          aria-hidden="true"
        >
          <span
            className="block h-full rounded-full bg-accent"
            style={{ width: `${Math.min(Math.max(meterPercent, 0), 100)}%` }}
          />
        </span>
      )}
    </div>
  );
}
