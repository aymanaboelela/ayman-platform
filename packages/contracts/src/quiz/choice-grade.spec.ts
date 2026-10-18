import { describe, expect, it } from 'vitest';
import { gradeChoice } from './choice-grade';

const WEIGHTED = [
  { id: 'best', fraction: 1 },
  { id: 'close', fraction: 0.5 },
  { id: 'wrong', fraction: 0 },
  { id: 'penalty', fraction: -0.5 },
];

describe('gradeChoice', () => {
  it('gives a single answer its option’s own weight — not «right or not»', () => {
    expect(gradeChoice('mcq_single', WEIGHTED, ['close'])).toEqual({ fraction: 0.5, matched: ['close'] });
    expect(gradeChoice('mcq_single', WEIGHTED, ['best'])).toEqual({ fraction: 1, matched: ['best'] });
    // Verbatim, negative included: the floor is the slot's, applied later.
    expect(gradeChoice('true_false', WEIGHTED, ['penalty'])).toEqual({ fraction: -0.5, matched: ['penalty'] });
  });

  it('refuses what a single answer cannot be', () => {
    expect(gradeChoice('mcq_single', WEIGHTED, [])).toBeNull();
    expect(gradeChoice('mcq_single', WEIGHTED, ['best', 'close'])).toBeNull();
    expect(gradeChoice('mcq_single', WEIGHTED, ['not-an-option'])).toBeNull();
  });

  it('sums a multiple answer and keeps it between nothing and everything', () => {
    expect(gradeChoice('mcq_multi', WEIGHTED, ['close', 'best'])).toEqual({ fraction: 1, matched: ['best', 'close'] });
    expect(gradeChoice('mcq_multi', WEIGHTED, ['close'])).toEqual({ fraction: 0.5, matched: ['close'] });
    expect(gradeChoice('mcq_multi', WEIGHTED, ['penalty', 'wrong'])?.fraction).toBe(0);
    expect(gradeChoice('mcq_multi', WEIGHTED, [])).toEqual({ fraction: 0, matched: [] });
  });
});
