import type { ReactNode } from 'react';
import { cn } from '@ayman/ui';

/**
 * One number and its label. Four of these sit under the dashboard's hero.
 *
 * ## What changed, and why
 *
 * Two rebuilds, and the second is a correction of the first. The original tile
 * opened with a 32px accent-tinted chip behind the icon, and four of them in a
 * row read as four unexplained orange squares competing with the page's real
 * primary action. The fix at the time was to strip the colour out entirely —
 * an `fg-faint` glyph at the tile's inline end — and that traded one problem
 * for the one this whole pass exists to undo: four hairline rectangles with a
 * number in each, indistinguishable from a table.
 *
 * `.tile` (see `study.css`) is the version that resolves both. The icon goes
 * back into a well, so the four tiles have a shape at a glance, but the well is
 * EMBER — structure, a category marker — and therefore does not read as
 * something to press. Exactly one tile on the screen carries `accent`, and it
 * is the one measuring the thing the student is acting on.
 *
 * ## The meter
 *
 * Optional, and supplied only where a fraction is genuinely meaningful —
 * lessons completed, overall progress. It is NOT drawn for "courses enrolled"
 * (a count with no denominator) or "average score" (an average, not a share of
 * anything). A meter under a number that has no whole is a bar the student
 * cannot interpret, and four bars where two are meaningless devalues the two
 * that are. It stays amber for the reason `LessonProgressBar` documents:
 * progress is a position, and position is amber's job.
 *
 * The value is `.tile__value` because these sit in a row and change between
 * renders — the class carries `tabular-nums` so proportional digits cannot make
 * the tiles jitter relative to each other as a student's numbers grow.
 */
export function StatTile({
  icon,
  value,
  label,
  suffix,
  meterPercent,
  accent = false,
  className,
}: {
  icon: ReactNode;
  value: string | number;
  label: string;
  suffix?: string;
  /** 0–100. Omit where the number is not a share of a whole. */
  meterPercent?: number;
  /**
   * Swaps the ember well for the amber one. At most ONE tile per screen —
   * the modifier exists to single out the statistic the student is acting on,
   * and two of them single out nothing.
   */
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('tile', accent && 'tile--accent', className)}>
      <span className="tile__well" aria-hidden="true">
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1">
          <span className="tile__value">{value}</span>
          {suffix ? (
            <span className="text-[length:var(--fs-text-sm)] text-fg-muted">{suffix}</span>
          ) : null}
        </span>

        <span className="tile__label">{label}</span>

        {meterPercent === undefined ? null : (
          // Decorative: the number above IS the value, stated in text. A
          // `progressbar` role here would announce the same figure a second
          // time with no extra meaning.
          <span
            className="mt-2 block h-[3px] w-full overflow-hidden rounded-full bg-surface-4"
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full bg-accent"
              style={{ inlineSize: `${Math.min(Math.max(meterPercent, 0), 100)}%` }}
            />
          </span>
        )}
      </div>
    </div>
  );
}
