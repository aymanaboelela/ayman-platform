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
 * Postgres stores `timestamptz` in UTC, so `date_trunc('day', started_at)`
 * cuts the day at 02:00 or 03:00 local — which moves a 1 a.m. revision session
 * (this product's single most common one) into the previous day's bucket and
 * makes every "yesterday" number quietly wrong. `AT TIME ZONE` first, always.
 */
export const CAIRO = 'Africa/Cairo';

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
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (cursor.getTime() <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}
