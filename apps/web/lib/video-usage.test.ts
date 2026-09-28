import { describe, expect, it } from 'vitest';
import { summarise } from './video-usage-math';

const day = (date: string, gb: number) => ({ max: { payloadSize: gb * 1e9, objectCount: 1 }, dimensions: { datetime: `${date}T12:00:00Z` } });

describe('summarise', () => {
  it('bills the average of each day’s largest size, for the share of the month covered', () => {
    const usage = summarise([day('2026-09-01', 10), day('2026-09-01', 12), day('2026-09-02', 20)], [], 1);
    expect(usage.averageBytes).toBe(16e9); // (12 + 20) / 2
    expect(usage.costUsd).toBeCloseTo(16 * 0.015);
    expect(summarise([day('2026-09-01', 10)], [], 0.5).costUsd).toBeCloseTo(10 * 0.015 * 0.5);
  });

  it('prices writes as Class A, reads as Class B, and deletes as free', () => {
    const usage = summarise(
      [],
      [
        { sum: { requests: 2_000_000 }, dimensions: { actionType: 'PutObject' } },
        { sum: { requests: 10_000_000 }, dimensions: { actionType: 'GetObject' } },
        { sum: { requests: 5_000 }, dimensions: { actionType: 'DeleteObject' } },
      ],
      1,
    );
    expect(usage.classA).toBe(2_000_000);
    expect(usage.classB).toBe(10_000_000);
    expect(usage.costUsd).toBeCloseTo(2 * 4.5 + 10 * 0.36);
  });
});
