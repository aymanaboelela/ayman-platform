import { describe, expect, it } from 'vitest';
import { RANK_LEVELS, levelFor } from './rank';

describe('levelFor — المستوى من النقط', () => {
  it('starts everyone at the first level, even with no points', () => {
    expect(levelFor(0)).toMatchObject({ index: 0, key: 'bronze', progress: 0 });
    expect(levelFor(-5).key).toBe('bronze');
    expect(levelFor(Number.NaN).key).toBe('bronze');
  });

  it('moves up exactly at the threshold and reports the way to the next one', () => {
    const silver = RANK_LEVELS[1]!;
    expect(levelFor(silver.min - 1).key).toBe('bronze');
    const at = levelFor(silver.min);
    expect(at.key).toBe('silver');
    expect(at.next?.key).toBe('gold');
    expect(at.progress).toBe(0);
    expect(levelFor((silver.min + RANK_LEVELS[2]!.min) / 2).progress).toBeCloseTo(0.5);
  });

  it('the last level has nothing after it and is full', () => {
    const last = levelFor(1_000_000);
    expect(last.key).toBe('legend');
    expect(last.next).toBeNull();
    expect(last.progress).toBe(1);
  });

  it('thresholds climb strictly, or a level could never be reached', () => {
    for (let i = 1; i < RANK_LEVELS.length; i++) {
      expect(RANK_LEVELS[i]!.min).toBeGreaterThan(RANK_LEVELS[i - 1]!.min);
    }
  });
});
