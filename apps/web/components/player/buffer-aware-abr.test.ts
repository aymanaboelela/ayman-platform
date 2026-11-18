import { describe, expect, it } from 'vitest';
import { abrFactorsFor, bufferAhead, DEEP_BUFFER_S, SHALLOW_BUFFER_S } from './buffer-aware-abr';

describe('abrFactorsFor', () => {
  it('keeps #823 headroom while little is buffered — the anti-freeze case', () => {
    expect(abrFactorsFor(0)).toEqual({ down: 0.7, up: 0.5 });
    expect(abrFactorsFor(SHALLOW_BUFFER_S)).toEqual({ down: 0.7, up: 0.5 });
    expect(abrFactorsFor(Number.NaN)).toEqual({ down: 0.7, up: 0.5 });
  });

  it('uses more of the line once a deep buffer can absorb a slow segment', () => {
    expect(abrFactorsFor(DEEP_BUFFER_S)).toEqual({ down: 0.9, up: 0.75 });
    expect(abrFactorsFor(120)).toEqual({ down: 0.9, up: 0.75 });
  });

  it('walks between the two, never flipping at one threshold', () => {
    const mid = abrFactorsFor((SHALLOW_BUFFER_S + DEEP_BUFFER_S) / 2);
    expect(mid.down).toBeCloseTo(0.8, 5);
    expect(mid.up).toBeCloseTo(0.63, 5);
    // monotonic: more buffer never means less headroom used
    let prev = abrFactorsFor(0).down;
    for (let s = 1; s <= 40; s += 1) {
      const d = abrFactorsFor(s).down;
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });

  it('always keeps the climb stricter than the hold, so it does not flap', () => {
    for (let s = 0; s <= 40; s += 1) {
      const f = abrFactorsFor(s);
      expect(f.up).toBeLessThan(f.down);
    }
  });
});

describe('bufferAhead', () => {
  const ranges = (...r: Array<[number, number]>) => ({
    length: r.length,
    start: (i: number) => r[i]![0],
    end: (i: number) => r[i]![1],
  });

  it('measures the range the playhead is in', () => {
    expect(bufferAhead({ buffered: ranges([0, 10], [20, 70]) as TimeRanges, currentTime: 25 })).toBe(45);
  });

  it('is zero in a gap — what is buffered further on cannot play yet', () => {
    expect(bufferAhead({ buffered: ranges([0, 10], [20, 70]) as TimeRanges, currentTime: 15 })).toBe(0);
  });
});
