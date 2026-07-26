import { kelleyDiscrimination } from './discrimination';

describe('kelleyDiscrimination', () => {
  it('returns 1 for an item only the top group answered', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => ({ total: 100 - i, fraction: 1 })),
      ...Array.from({ length: 10 }, (_, i) => ({ total: 10 - i, fraction: 0 })),
    ];
    expect(kelleyDiscrimination(rows)).toBe(1);
  });

  it('returns -1 for an item only the BOTTOM group answered — a broken key', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => ({ total: 100 - i, fraction: 0 })),
      ...Array.from({ length: 10 }, (_, i) => ({ total: 10 - i, fraction: 1 })),
    ];
    expect(kelleyDiscrimination(rows)).toBe(-1);
  });

  it('returns 0 when both groups perform identically', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ total: 100 - i, fraction: 0.5 }));
    expect(kelleyDiscrimination(rows)).toBe(0);
  });

  it('handles partial credit, not just 0/1', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => ({ total: 100 - i, fraction: 0.8 })),
      ...Array.from({ length: 10 }, (_, i) => ({ total: 10 - i, fraction: 0.2 })),
    ];
    const result = kelleyDiscrimination(rows);
    expect(result).not.toBeNull();
    expect(result).toBeCloseTo(0.6, 5);
  });

  it('returns null below the minimum sample size instead of a confident lie', () => {
    expect(kelleyDiscrimination([{ total: 1, fraction: 1 }])).toBeNull();
  });

  it('takes at least one attempt in each group when 27% rounds to zero', () => {
    // N=1: round(1 * 0.27) = round(0.27) = 0 — an empty group would divide
    // by zero. `minSampleSize: 1` is needed too, or the default (10) would
    // return null before groupSize is ever computed.
    const result = kelleyDiscrimination([{ total: 2, fraction: 1 }], { minSampleSize: 1 });
    expect(result).not.toBeNull();
    expect(Number.isFinite(result)).toBe(true);
  });

  it('is stable when every total is identical', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ total: 50, fraction: i % 2 === 0 ? 1 : 0 }));
    expect(() => kelleyDiscrimination(rows)).not.toThrow();
    expect(Number.isFinite(kelleyDiscrimination(rows))).toBe(true);
  });

  it('respects a minSampleSize override', () => {
    const rows = [
      { total: 2, fraction: 1 },
      { total: 1, fraction: 0 },
    ];
    expect(kelleyDiscrimination(rows)).toBeNull(); // default minSampleSize 10
    expect(kelleyDiscrimination(rows, { minSampleSize: 2 })).not.toBeNull();
  });
});
