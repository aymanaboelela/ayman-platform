import {
  RETENTION_STEPS,
  VIDEO_PERIOD_DAYS,
  VIDEO_SERIES_MAX_DAYS,
  type VideoDailyPoint,
  type VideoPeriod,
} from '@ayman/contracts/admin/video-analytics';
import { CAIRO, cairoDayKey, dayKeys } from './analytics-shared';

/**
 * The arithmetic behind «إحصائيات الفيديو», kept out of the service so it can
 * be tested without a database. Every function here is pure; the SQL hands it
 * aggregates, never rows per sitting.
 */

/** Cairo wall-clock parts of an instant — the input `cairoOffsetMs` needs. */
const CAIRO_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: CAIRO,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** How far Cairo's wall clock is ahead of UTC at `instant`, in ms. */
function cairoOffsetMs(instant: Date): number {
  const parts = Object.fromEntries(CAIRO_PARTS.formatToParts(instant).map((part) => [part.type, part.value]));
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

/** `YYYY-MM-DD` shifted by whole CALENDAR days — not by 24h, which a DST day is not. */
export function addDays(dayKey: string, days: number): string {
  const cursor = new Date(`${dayKey}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

/**
 * The instant a Cairo calendar day begins.
 *
 * Two passes, because the offset has to be read AT the answer and the answer
 * is not known until the offset is: the first guess uses the offset at UTC
 * midnight, the second corrects it on the one day a year the two differ.
 * Egypt switches its clocks AT midnight, so on the spring-forward day there is
 * no 00:00 at all — this returns the moment the day actually starts (01:00).
 */
export function cairoMidnight(dayKey: string): Date {
  const wall = Date.parse(`${dayKey}T00:00:00Z`);
  const guess = wall - cairoOffsetMs(new Date(wall));
  return new Date(wall - cairoOffsetMs(new Date(guess)));
}

/**
 * Where a period starts: Cairo midnight, `days − 1` calendar days before
 * today — so «آخر ٧ أيام» is seven whole bars with today as the last, the way
 * YouTube Studio draws it. `null` for all time.
 *
 * Deliberately NOT `now − days × 24h` (what the overview does): that window
 * starts mid-afternoon, so its first bar is a fraction of a day and reads as
 * a dip that never happened.
 */
export function periodStart(period: VideoPeriod, now: Date): Date | null {
  const days = VIDEO_PERIOD_DAYS[period];
  if (days === null) return null;
  return cairoMidnight(addDays(cairoDayKey(now), -(days - 1)));
}

/**
 * Where the daily CHART starts. The period's own start when it has one; for
 * all time, the first day anybody watched — capped at a year back, because a
 * daily line past that is a smear and the headline numbers above it already
 * carry the whole history — and never less than a week, because a line needs
 * two points and a video first watched this morning has one.
 */
export function seriesStart(period: VideoPeriod, now: Date, firstViewAt: Date | null): Date {
  const start = periodStart(period, now);
  if (start !== null) return start;
  const today = cairoDayKey(now);
  const floor = addDays(today, -(VIDEO_SERIES_MAX_DAYS - 1));
  const latest = addDays(today, -(ALL_TIME_MIN_DAYS - 1));
  const first = firstViewAt === null ? latest : cairoDayKey(firstViewAt);
  return cairoMidnight(first < floor ? floor : first > latest ? latest : first);
}

/** The shortest all-time chart — see `seriesStart`. */
const ALL_TIME_MIN_DAYS = 7;

/** One row per Cairo day as the SQL returns it — only the days that had views. */
export interface DayAggregate {
  day: string;
  views: number;
  viewers: number;
  watchSeconds: number;
}

/** The chart's series: every day from `from` to `now`, zeros included. */
export function dailySeries(from: Date, now: Date, rows: readonly DayAggregate[]): VideoDailyPoint[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return dayKeys(from, now).map((date) => {
    const row = byDay.get(date);
    return {
      date,
      views: row?.views ?? 0,
      viewers: row?.viewers ?? 0,
      watchMinutes: (row?.watchSeconds ?? 0) / 60,
    };
  });
}

/**
 * The retention curve from a histogram of «furthest step reached».
 *
 * `step` is `floor(reach × RETENTION_STEPS)` — 0..20, computed in SQL in
 * INTEGER arithmetic (`max_position × 20 / duration`), so 7 minutes into a
 * 20-minute video is step 7 exactly and not 6.999… floored to 6.
 *
 * Point k is the share of viewers whose step is ≥ k, i.e. a suffix sum. Point
 * 0 is therefore always 1: everybody reached the start. `null` when nobody has
 * a measurable position — a curve over zero viewers is not a flat line at 0%.
 */
export function retentionCurve(histogram: readonly { step: number; n: number }[]): number[] | null {
  const counts = new Array<number>(RETENTION_STEPS + 1).fill(0);
  for (const { step, n } of histogram) {
    const index = Math.min(RETENTION_STEPS, Math.max(0, Math.trunc(step)));
    counts[index] = (counts[index] ?? 0) + n;
  }
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total === 0) return null;

  const curve = new Array<number>(RETENTION_STEPS + 1).fill(0);
  let reached = 0;
  for (let step = RETENTION_STEPS; step >= 0; step -= 1) {
    reached += counts[step] ?? 0;
    curve[step] = reached / total;
  }
  return curve;
}

/** Views by the Cairo hour they started, all 24 present. */
export function hourSeries(rows: readonly { hour: number; n: number }[]): number[] {
  const hours = new Array<number>(24).fill(0);
  for (const { hour, n } of rows) {
    if (hour >= 0 && hour < 24) hours[hour] = (hours[hour] ?? 0) + n;
  }
  return hours;
}

/** A mean with a zero denominator is unknown, not zero — see `rate`. */
export function perView(total: number, views: number): number | null {
  return views > 0 ? total / views : null;
}
