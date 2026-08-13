import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';

const c = copy.analytics;

/**
 * Number formatting for the analytics surface.
 *
 * `ar-EG` throughout, so digits render as ١٢٣ like every other number in the
 * product — EXCEPT inside `<svg>` text and CSV cells, where the caller asks
 * for Latin digits explicitly. (Arabic-Indic digits inside an SVG `<text>` do
 * render, but they are what a screenshot pasted into a spreadsheet cannot be
 * read back out of.)
 */
const AR = 'ar-EG';

export function num(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(AR, { maximumFractionDigits }).format(value);
}

/**
 * A rate, as a percentage — and `null` renders as «—», NEVER as «٠٪».
 *
 * This is the single most important formatter on the screen. A rate with no
 * denominator is unknown, and 0% is a claim; the API returns `null` for
 * exactly that case and the renderer must not launder it into a number.
 */
export function pct(fraction: number | null | undefined, digits = 0): string {
  if (fraction === null || fraction === undefined) return c.unknown;
  return new Intl.NumberFormat(AR, {
    style: 'percent',
    maximumFractionDigits: digits,
  }).format(fraction);
}

/** Same rule for any nullable count or measure. */
export function maybe(value: number | null | undefined, digits = 0): string {
  return value === null || value === undefined ? c.unknown : num(value, digits);
}

/** A duration, in the largest unit that keeps it readable. Under a minute is
 *  said in words rather than «٠ د», which reads as "no time at all". */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return c.unknown;
  if (seconds < 60) return c.underMinute;
  if (seconds < 3600) return `${num(Math.round(seconds / 60))} ${c.minutesShort}`;
  return `${num(seconds / 3600, 1)} ${c.hoursShort}`;
}

export function hours(value: number | null | undefined): string {
  if (value === null || value === undefined) return c.unknown;
  return `${num(value, value < 10 ? 1 : 0)} ${c.hoursShort}`;
}

/** The label under a score-decile column: «٧٠–٨٠٪». Bucket 1..10. */
export function bucketLabel(bucket: number): string {
  return formatCopy(c.rangeSeconds, {
    from: num((bucket - 1) * 10),
    to: num(bucket * 10),
  });
}

/** The label under a duration bucket. The overflow bucket says «أكتر من X»
 *  rather than showing an open range, because that bucket is the interesting
 *  one and a blank axis label hides it. */
export function durationBucketLabel(
  upperSeconds: number | null,
  previousUpper: number | null,
): string {
  if (upperSeconds === null) {
    return formatCopy(c.overSeconds, { n: duration(previousUpper ?? 0) });
  }
  if (previousUpper === null) return `< ${duration(upperSeconds)}`;
  return formatCopy(c.rangeSeconds, { from: duration(previousUpper), to: duration(upperSeconds) });
}

/** `YYYY-MM-DD` → «١٣ أغسطس». Day + month only: a 90-point axis has no room
 *  for a year, and every point is inside the same one. */
export function shortDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat(AR, { day: 'numeric', month: 'short' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

export function dateTime(iso: string | null): string {
  if (iso === null) return c.never;
  return new Intl.DateTimeFormat(AR, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}
