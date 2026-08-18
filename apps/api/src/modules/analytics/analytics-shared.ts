import { Prisma } from '../../generated/prisma/client';
import {
  DURATION_BUCKETS_SECONDS,
  GRADE_BANDS,
  gradeBandOf,
  type Bucket,
  type DurationBucket,
  type GradeBandCount,
} from '@ayman/contracts/admin/analytics';

/**
 * Re-exported, not redeclared. `AnalyticsService.forQuiz` says it out loud: a
 * student told they are weak at a topic and a teacher reading the same numbers
 * must not be looking at different populations. This module widens that from
 * one quiz to the whole platform, so it has to count the same sittings — and a
 * second `['submitted', 'pending_review']` literal in this directory is how
 * that stops being true six months from now.
 */
export { GRADED_STATES } from '../quiz/analytics.service';

/**
 * Every day boundary in this module is a CAIRO day boundary.
 *
 * `date_trunc('day', started_at)` cuts the day at 02:00 or 03:00 local, which
 * moves a 1 a.m. revision session (this product's single most common one) into
 * the previous day's bucket and makes every "yesterday" number quietly wrong.
 * That is the hazard. Two things about HOW to avoid it are not obvious, and
 * getting either wrong reintroduces it in a form nobody notices:
 *
 * 1. **These columns are `timestamp WITHOUT time zone`.** Prisma's `DateTime`
 *    maps to `timestamp(3)`, not `timestamptz`, and it writes UTC instants
 *    into them. For a naive timestamp, `x AT TIME ZONE 'Africa/Cairo'` does
 *    the OPPOSITE of what it reads like: it INTERPRETS `x` as Cairo wall time
 *    and returns the instant, shifting it three hours EARLIER — and then
 *    `::date` renders that in the SESSION timezone, so the answer also depends
 *    on the server's `TimeZone` setting. Locally (session = Africa/Cairo) the
 *    two errors cancelled and everything looked right; in CI and in production
 *    (session = UTC) they did not, and every row timestamped between 00:00 and
 *    03:00 UTC landed on the previous date. Hence `cairoDay()` below: label
 *    the value as UTC first, THEN convert. Never a bare `AT TIME ZONE CAIRO`.
 * 2. **The key list has to be built the same way.** `dayKeys` used UTC
 *    calendar dates while the rows were bucketed by (attempted) Cairo dates,
 *    so the last key was routinely a day the SQL could not emit and "today"
 *    read zero.
 *
 * Both halves are covered by `analytics-shared.spec.ts` and, end to end, by
 * `analytics.int-spec.ts`.
 */
/**
 * The population every analytics screen describes, as JOINs onto a column
 * holding a user id: a student the admin can actually open — `role = 'student'`
 * with the `student_profiles` row that carries their name, year and
 * governorate. Exactly who `/admin/students` and `/admin/analytics/students`
 * list.
 *
 * Shared by `OverviewService` and `LessonAnalyticsService` because they print
 * their counts on two screens one link apart. Before it, "students" meant
 * three different sets on the overview alone and a fourth on the lesson table
 * — where `eligible` counted every active enrollment while the roster
 * underneath it could only list the ones with a profile, so the difference
 * fell silently into the «ولا حاجة» slice of the engagement donut.
 *
 * A function rather than a constant because it is spliced into queries that
 * each name the user column differently. `Prisma.raw` is safe here for the
 * same reason it is in `cairoDay` below: the argument is a SQL identifier this
 * repository writes, never anything off a request. The `su`/`sp` aliases are
 * private to the fragment — no caller may reuse them.
 */
export function studentJoins(userColumn: string): Prisma.Sql {
  return Prisma.sql`
        JOIN "app"."users" su ON su."id" = ${Prisma.raw(userColumn)} AND su."role" = 'student'
        JOIN "app"."student_profiles" sp ON sp."user_id" = ${Prisma.raw(userColumn)}`;
}

export const CAIRO = 'Africa/Cairo';

/**
 * The day bucket for a naive-UTC timestamp column, as `YYYY-MM-DD` in Cairo.
 *
 * `column` is a SQL identifier written by this repository — never anything
 * that came off a request — which is what makes `Prisma.raw` safe here.
 */
export function cairoDay(column: string): Prisma.Sql {
  return Prisma.sql`to_char(((${Prisma.raw(column)} AT TIME ZONE 'UTC') AT TIME ZONE ${CAIRO})::date, 'YYYY-MM-DD')`;
}

/** The JS twin of `cairoDay` — the Cairo calendar date an instant falls on. */
const CAIRO_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAIRO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function cairoDayKey(instant: Date): string {
  // `en-CA` is ISO-shaped (`2026-08-16`) by locale definition, which is why it
  // is used here rather than assembling the parts by hand.
  return CAIRO_DATE.format(instant);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** `n / d`, or null when the denominator is zero — never `NaN`, never `0`.
 *  A rate with no denominator is unknown, and rendering it as 0% is a lie the
 *  reader has no way to detect. */
export function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/**
 * Fraction (0..1) → bucket 1..10, where bucket 10 is [0.9, 1.0] INCLUSIVE.
 *
 * The `Math.min(…, 10)` is the JS twin of the `LEAST(width_bucket(…), 10)` in
 * `AnalyticsService.forQuiz`: without it a perfect score lands in an eleventh
 * bucket that no axis draws and no reader ever sees.
 */
export function bucketOf(fraction: number): number {
  return Math.min(10, Math.max(1, Math.floor(fraction * 10) + 1));
}

export function bucketsFrom(fractions: readonly number[]): Bucket[] {
  const counts = new Map<number, number>();
  for (const fraction of fractions) {
    const bucket = bucketOf(fraction);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a - b).map(([bucket, n]) => ({ bucket, n }));
}

/** Always all five bands, zeros included — the band chart is a fixed five-way
 *  scale, so a missing «راسب» reads as "we didn't measure it" rather than
 *  "nobody failed". Distributions over an open range (`bucketsFrom` above) are
 *  the opposite case and stay sparse. */
export function gradeBandsFrom(fractions: readonly number[]): GradeBandCount[] {
  const counts = new Map(GRADE_BANDS.map((band) => [band, 0]));
  for (const fraction of fractions) {
    const band = gradeBandOf(fraction);
    counts.set(band, (counts.get(band) ?? 0) + 1);
  }
  return GRADE_BANDS.map((band) => ({ band, n: counts.get(band) ?? 0 }));
}

/** Also always complete, and always ending with the `null` overflow bucket. */
export function durationBucketsFrom(seconds: readonly number[]): DurationBucket[] {
  const edges = [...DURATION_BUCKETS_SECONDS];
  const counts = new Array<number>(edges.length + 1).fill(0);
  for (const value of seconds) {
    const found = edges.findIndex((edge) => value < edge);
    const index = found === -1 ? edges.length : found;
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts.map((n, index) => ({
    upperSeconds: index < edges.length ? edges[index]! : null,
    n,
  }));
}

/**
 * The elapsed wall-clock of a sitting, or null when it cannot be known.
 *
 * Deliberately NOT "time the student was actually working": an attempt left
 * open overnight and submitted the next morning has a real 9-hour elapsed
 * time, and that is what this returns. The distribution's overflow bucket is
 * where those land, and seeing them there is the point — they are the sittings
 * whose scores mean the least.
 */
export function attemptSeconds(startedAt: Date, submittedAt: Date | null): number | null {
  if (submittedAt === null) return null;
  const seconds = Math.round((submittedAt.getTime() - startedAt.getTime()) / 1000);
  return seconds >= 0 ? seconds : null;
}

/** Postgres `avg` of a ratio can land a hair outside [0,1] on float rounding,
 *  and the contract says 0..1 — Zod rejects `1.0000000000000002` at the web
 *  edge, which turns a rounding artefact into a 500 on the whole page. */
export function clampFraction(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

/** Postgres `numeric` arrives as a Prisma `Decimal`; `null` stays `null`. */
export function toNumber(value: { toString(): string } | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

/** An attempt's score as a fraction of its OWN `gradeOutOf` — see the contract
 *  file for why nothing here ever puts a raw mark on the wire. */
export function scoreFraction(
  scaledScore: { toString(): string } | null,
  gradeOutOf: { toString(): string },
): number | null {
  const score = toNumber(scaledScore);
  const outOf = toNumber(gradeOutOf);
  if (score === null || outOf === null || outOf <= 0) return null;
  return Math.min(1, Math.max(0, score / outOf));
}

/** `YYYY-MM-DD` for every day in `[from, to]`, so a series never has a hole in
 *  it. See `DailyPointSchema` for why a hole is worse than a zero. */
export function dayKeys(from: Date, to: Date): string[] {
  const end = cairoDayKey(to);
  const keys: string[] = [];
  // The cursor walks CALENDAR dates, so it is stepped as UTC midnights of the
  // Cairo date rather than by adding 24h to an instant — a day is not always
  // 24 hours long, and this loop must not care.
  const cursor = new Date(`${cairoDayKey(from)}T00:00:00Z`);
  let key = cairoDayKey(from);
  while (key <= end) {
    keys.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    key = cursor.toISOString().slice(0, 10);
  }
  return keys;
}
