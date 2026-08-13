import { DURATION_BUCKETS_SECONDS, gradeBandOf } from '@ayman/contracts/admin/analytics';
import {
  attemptSeconds,
  bucketOf,
  bucketsFrom,
  clampFraction,
  dayKeys,
  durationBucketsFrom,
  gradeBandsFrom,
  mean,
  median,
  rate,
  scoreFraction,
} from './analytics-shared';

describe('bucketOf', () => {
  it('puts a perfect score in bucket 10, not an eleventh', () => {
    // The JS twin of `LEAST(width_bucket(…), 10)`. An eleventh bucket is one
    // no axis draws, so a full mark would vanish off the chart.
    expect(bucketOf(1)).toBe(10);
  });

  it('splits on the tenths, low edge inclusive', () => {
    expect(bucketOf(0)).toBe(1);
    expect(bucketOf(0.0999)).toBe(1);
    expect(bucketOf(0.1)).toBe(2);
    expect(bucketOf(0.9)).toBe(10);
  });
});

describe('bucketsFrom', () => {
  it('omits empty buckets rather than zero-filling them', () => {
    expect(bucketsFrom([0.05, 0.07, 0.95])).toEqual([
      { bucket: 1, n: 2 },
      { bucket: 10, n: 1 },
    ]);
  });

  it('is empty for no data at all', () => {
    expect(bucketsFrom([])).toEqual([]);
  });
});

describe('gradeBandsFrom', () => {
  it('always returns all five bands, zeros included', () => {
    // The opposite convention to bucketsFrom, on purpose: a missing «راسب»
    // would read as "not measured" rather than "nobody failed".
    expect(gradeBandsFrom([])).toEqual([
      { band: 'a', n: 0 },
      { band: 'b', n: 0 },
      { band: 'c', n: 0 },
      { band: 'd', n: 0 },
      { band: 'f', n: 0 },
    ]);
  });

  it('places each score in the band its floor names', () => {
    const bands = gradeBandsFrom([1, 0.85, 0.84, 0.75, 0.65, 0.5, 0.49, 0]);
    expect(bands).toEqual([
      { band: 'a', n: 2 },
      { band: 'b', n: 2 },
      { band: 'c', n: 1 },
      { band: 'd', n: 1 },
      { band: 'f', n: 2 },
    ]);
  });

  it('agrees with the contract helper on every boundary', () => {
    expect(gradeBandOf(0.85)).toBe('a');
    expect(gradeBandOf(0.8499)).toBe('b');
    expect(gradeBandOf(0.5)).toBe('d');
    expect(gradeBandOf(0.4999)).toBe('f');
  });
});

describe('durationBucketsFrom', () => {
  it('returns every edge plus the overflow bucket', () => {
    const buckets = durationBucketsFrom([]);
    expect(buckets).toHaveLength(DURATION_BUCKETS_SECONDS.length + 1);
    expect(buckets.at(-1)?.upperSeconds).toBeNull();
  });

  it('puts a value on an edge in the bucket ABOVE it', () => {
    // Bounds are exclusive-upper: 60s is "1–3 minutes", not "under a minute".
    const buckets = durationBucketsFrom([59, 60]);
    expect(buckets[0]).toEqual({ upperSeconds: 60, n: 1 });
    expect(buckets[1]).toEqual({ upperSeconds: 180, n: 1 });
  });

  it('collects the long tail in the overflow bucket', () => {
    const buckets = durationBucketsFrom([7200, 86_400]);
    expect(buckets.at(-1)).toEqual({ upperSeconds: null, n: 2 });
  });
});

describe('rate', () => {
  it('is null on a zero denominator, never 0 and never NaN', () => {
    // A rate with no denominator is unknown. Rendering it as 0% is a lie the
    // reader cannot detect.
    expect(rate(0, 0)).toBeNull();
    expect(rate(3, 0)).toBeNull();
  });

  it('divides when there is something to divide by', () => {
    expect(rate(3, 4)).toBe(0.75);
  });
});

describe('median / mean', () => {
  it('averages the two middles on an even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([3, 1])).toBe(2);
  });

  it('is null on no data', () => {
    expect(median([])).toBeNull();
    expect(mean([])).toBeNull();
  });
});

describe('scoreFraction', () => {
  it('scales against the attempt’s OWN grade_out_of', () => {
    expect(scoreFraction({ toString: () => '18' }, { toString: () => '20' })).toBe(0.9);
  });

  it('is null when the denominator is zero or missing', () => {
    expect(scoreFraction({ toString: () => '5' }, { toString: () => '0' })).toBeNull();
    expect(scoreFraction(null, { toString: () => '20' })).toBeNull();
  });

  it('clamps a regrade that overshot the maximum', () => {
    expect(scoreFraction({ toString: () => '25' }, { toString: () => '20' })).toBe(1);
  });
});

describe('clampFraction', () => {
  it('pulls a float-rounding overshoot back inside 0..1', () => {
    // Zod rejects 1.0000000000000002, which would 500 the whole page over a
    // rounding artefact in a Postgres avg().
    expect(clampFraction(1.0000000000000002)).toBe(1);
    expect(clampFraction(-1e-17)).toBe(0);
  });

  it('passes null and non-finite through as null', () => {
    expect(clampFraction(null)).toBeNull();
    expect(clampFraction(Number.NaN)).toBeNull();
  });
});

describe('attemptSeconds', () => {
  it('measures elapsed wall-clock between start and submit', () => {
    const start = new Date('2026-08-01T10:00:00Z');
    const end = new Date('2026-08-01T10:12:30Z');
    expect(attemptSeconds(start, end)).toBe(750);
  });

  it('is null for an attempt that was never submitted', () => {
    expect(attemptSeconds(new Date(), null)).toBeNull();
  });

  it('is null rather than negative if the clocks disagree', () => {
    const start = new Date('2026-08-01T10:00:00Z');
    const end = new Date('2026-08-01T09:59:00Z');
    expect(attemptSeconds(start, end)).toBeNull();
  });
});

describe('dayKeys', () => {
  it('emits every day in the window inclusive, so a series has no holes', () => {
    const keys = dayKeys(new Date('2026-08-01T23:00:00Z'), new Date('2026-08-04T01:00:00Z'));
    expect(keys).toEqual(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04']);
  });

  it('handles a single-day window', () => {
    const day = new Date('2026-08-13T12:00:00Z');
    expect(dayKeys(day, day)).toEqual(['2026-08-13']);
  });

  it('crosses a month boundary', () => {
    const keys = dayKeys(new Date('2026-07-30T00:00:00Z'), new Date('2026-08-02T00:00:00Z'));
    expect(keys).toEqual(['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02']);
  });
});
