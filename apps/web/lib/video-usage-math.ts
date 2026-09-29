/** The billing arithmetic, apart from the fetch — pure, so it is tested without the network. */
import { R2_USD_PER_GB_MONTH, TENANT_VIDEO_PRICE_MULTIPLIER } from '@ayman/contracts/video';

/** R2 Standard, per GB-month — one number for the whole product, in contracts. */
const USD_PER_GB_MONTH = R2_USD_PER_GB_MONTH;
const USD_PER_MILLION_CLASS_A = 4.5;
const USD_PER_MILLION_CLASS_B = 0.36;

/**
 * Cloudflare's R2 pricing groups every S3 action into Class A (writes and
 * listings), Class B (reads) or free (deletes, aborts). Anything unknown is
 * counted as Class A — the dearer guess, so a bill is never understated.
 */
const CLASS_B = new Set([
  'HeadBucket',
  'HeadObject',
  'GetObject',
  'UsageSummary',
  'GetBucketEncryption',
  'GetBucketLocation',
  'GetBucketCors',
  'GetBucketLifecycleConfiguration',
]);
const FREE = new Set(['DeleteObject', 'DeleteObjects', 'DeleteBucket', 'AbortMultipartUpload']);

export interface UsagePeriod {
  /** Average stored bytes over the period — what GB-month is billed on. */
  averageBytes: number;
  classA: number;
  classB: number;
  /** Storage for the days covered + operations, before the account's free tier. */
  costUsd: number;
}

export interface StorageSample {
  max: { payloadSize: number; objectCount: number };
  dimensions: { datetime: string };
}
export interface OperationGroup {
  sum: { requests: number };
  dimensions: { actionType: string };
}

/**
 * Average stored bytes over a period: the day's largest sample, averaged over
 * the days of the period that have one. `coveredFraction` is the share of a
 * whole month the period spans — a month half over has been billed half its
 * storage so far.
 */
export function summarise(
  storage: readonly StorageSample[],
  ops: readonly OperationGroup[],
  coveredFraction: number,
): UsagePeriod {
  const perDay = new Map<string, number>();
  for (const sample of storage) {
    const day = sample.dimensions.datetime.slice(0, 10);
    perDay.set(day, Math.max(perDay.get(day) ?? 0, sample.max.payloadSize));
  }
  const days = [...perDay.values()];
  const averageBytes = days.length === 0 ? 0 : days.reduce((sum, bytes) => sum + bytes, 0) / days.length;

  let classA = 0;
  let classB = 0;
  for (const group of ops) {
    const action = group.dimensions.actionType;
    if (FREE.has(action)) continue;
    if (CLASS_B.has(action)) classB += group.sum.requests;
    else classA += group.sum.requests;
  }

  const costUsd =
    (averageBytes / 1e9) * USD_PER_GB_MONTH * coveredFraction +
    (classA / 1e6) * USD_PER_MILLION_CLASS_A +
    (classB / 1e6) * USD_PER_MILLION_CLASS_B;
  return { averageBytes, classA, classB, costUsd };
}


/**
 * What the owner charges a row, as a multiple of what it costs him: 1 for his
 * own stack, `TENANT_VIDEO_PRICE_MULTIPLIER` for every teacher's.
 */
export function priceMultiplier(tenantKey: string): number {
  return tenantKey === 'ayman' ? 1 : TENANT_VIDEO_PRICE_MULTIPLIER;
}

/** A full month at what is stored now — «هيدفع كام في الشهر لو فضل كده». Storage only: requests are cents. */
export function monthlyAtCurrentStorage(storedBytes: number, tenantKey: string): number {
  return (storedBytes / 1e9) * USD_PER_GB_MONTH * priceMultiplier(tenantKey);
}
