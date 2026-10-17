import { describe, expect, it } from 'vitest';
import { sittingSeconds, wholePercent } from './format';

describe('wholePercent', () => {
  it('rounds to a whole number', () => {
    expect(wholePercent(65)).toBe(65);
    expect(wholePercent(66.6667)).toBe(67);
    expect(wholePercent(0)).toBe(0);
    expect(wholePercent(100)).toBe(100);
  });

  it('never rounds a near-miss into «everyone» or a near-nothing into «nobody»', () => {
    expect(wholePercent(99.7)).toBe(99);
    expect(wholePercent(0.3)).toBe(1);
  });
});

describe('sittingSeconds', () => {
  it('measures start to hand-in', () => {
    expect(sittingSeconds('2026-10-10T18:00:00.000Z', '2026-10-10T18:22:30.000Z')).toBe(1350);
  });

  it('has no duration for an open sitting or a skewed one', () => {
    expect(sittingSeconds('2026-10-10T18:00:00.000Z', null)).toBeNull();
    expect(sittingSeconds('2026-10-10T18:00:00.000Z', '2026-10-10T17:59:00.000Z')).toBeNull();
  });
});
