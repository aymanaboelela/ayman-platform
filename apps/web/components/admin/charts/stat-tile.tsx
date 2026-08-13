import { cn } from '@ayman/ui/lib/cn';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { pct } from './format';

const c = copy.analytics;

/**
 * A headline number.
 *
 * Not a one-bar bar chart, not a gauge — a single current value is a NUMBER,
 * and the form that reads fastest for a number is the number. The optional
 * `context` line is the denominator or the comparison, and it is the whole
 * reason the tile is more useful than the figure alone: «١٤٢» answers nothing,
 * «١٤٢ من ٢٠٠» answers the question that was actually being asked.
 *
 * Proportional figures on the value (not `tabular-nums`): tabular gives every
 * digit the width of a zero, which reads loose at display sizes. Tabular is
 * for columns that have to align vertically — see the tables.
 */
export function StatTile({
  label,
  value,
  context,
  accent = false,
}: {
  label: string;
  value: string;
  context?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        accent
          ? 'border-[color-mix(in_oklch,var(--a-9),transparent_66%)] bg-[color-mix(in_oklch,var(--a-9),transparent_94%)]'
          : 'border-line bg-surface-2',
      )}
    >
      <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{label}</p>
      <p className="mt-1.5 text-[length:var(--fs-title-2)] font-semibold leading-none text-fg">
        {value}
      </p>
      {context ? (
        <p className="mt-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">{context}</p>
      ) : null}
    </div>
  );
}

/**
 * A ratio against its limit — one fill on a track of the same ramp, so the
 * state reads across the whole bar rather than only where the fill ends.
 *
 * A meter, not a two-slice donut: a pie of two slices asks the reader to
 * compare two areas to answer a question a length answers instantly.
 */
export function Meter({
  label,
  fraction,
  numerator,
  denominator,
  color = 'var(--viz-1)',
}: {
  label: string;
  fraction: number | null;
  numerator?: number;
  denominator?: number;
  color?: string;
}) {
  const width = fraction === null ? 0 : Math.min(1, Math.max(0, fraction)) * 100;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[length:var(--fs-text-sm)] text-fg-muted">{label}</span>
        <span className="tabular text-[length:var(--fs-text-sm)] font-medium text-fg">
          {pct(fraction)}
        </span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--viz-track)]"
        role="meter"
        aria-valuenow={fraction === null ? undefined : Math.round(width)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full transition-[width] duration-[320ms] ease-out"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
      {numerator !== undefined && denominator !== undefined ? (
        <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
          {formatCopy(c.ofTotal, { n: denominator })}
          {' · '}
          {numerator}
        </p>
      ) : null}
    </div>
  );
}
