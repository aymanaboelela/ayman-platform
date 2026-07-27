import { clamp, fractionToState, RIGHT_THRESHOLD, roundMark, WRONG_THRESHOLD } from './fraction';

// Ported from Moodle's question_state::graded_state_for_fraction():
//   if ($fraction < 0.000001) incorrect
//   else if ($fraction > 0.999999) correct
//   else partcorrect
// The epsilons are the whole point. Floating-point sums of option weights do
// not land on exactly 1, and an `=== 1` comparison marks a fully correct
// answer partially correct.
//
// B8: the RIGHT boundary is `>=`, not Moodle's `>`. A naive `1/3` split
// stored through `numeric(10,6)` sums to EXACTLY 0.999999 (three
// independently-rounded 0.333333s) — landing precisely on this threshold. A
// strict `>` graded that as "partial", which is exactly the bug: a student
// who ticks every correct option on a 3-way (or 9-way, or 12-way) even split
// scored a perfect answer as partially correct. `quantizeWeights`
// (question-bank.service.ts) now forces stored weights to sum to exactly
// 1.000000 at write time — but this threshold is fixed independently too,
// since summing already-quantized values back through IEEE-754 doubles can
// still land a hair below 1 for some splits.
describe('fractionToState', () => {
  it.each([
    [-1, 'graded_wrong'],
    [-0.25, 'graded_wrong'],
    [-0.0000001, 'graded_wrong'],
    [0, 'graded_wrong'],
    [0.0000009, 'graded_wrong'],
    [0.000001, 'graded_partial'],
    [0.0000011, 'graded_partial'],
    [0.5, 'graded_partial'],
    [0.999998, 'graded_partial'],
    [0.999999, 'graded_right'],
    [0.9999991, 'graded_right'],
    [1, 'graded_right'],
  ])('maps %p to %s', (fraction, expected) => {
    expect(fractionToState(fraction)).toBe(expected);
  });

  it('uses a strict comparison at the WRONG threshold but an inclusive one at RIGHT', () => {
    expect(fractionToState(WRONG_THRESHOLD)).toBe('graded_partial');
    // B8 regression: a naive three-way 1/3 split lands EXACTLY here after
    // rounding through numeric(10,6) — this must grade as fully right.
    expect(fractionToState(RIGHT_THRESHOLD)).toBe('graded_right');
  });

  it('B8 — three independently-rounded 1/3 weights (0.333333 each) sum to exactly the RIGHT_THRESHOLD, not above it, and still grade fully right', () => {
    const stored = 0.333333; // what `1/3` becomes through numeric(10,6)
    const sum = stored + stored + stored;
    expect(sum).toBe(0.999999);
    expect(sum).toBe(RIGHT_THRESHOLD);
    expect(fractionToState(sum)).toBe('graded_right');
  });

  it('marks a float-accumulated 1 as fully right, which `=== 1` would not', () => {
    const accumulated = Array.from({ length: 10 }, () => 0.1).reduce((a, b) => a + b, 0);
    expect(accumulated).toBe(0.9999999999999999);
    expect(accumulated === 1).toBe(false);
    expect(fractionToState(accumulated)).toBe('graded_right');
  });

  it('treats a NaN fraction as wrong rather than throwing — fail closed', () => {
    expect(fractionToState(Number.NaN)).toBe('graded_wrong');
  });
});

describe('clamp', () => {
  it.each([
    [-3, 0, 1, 0],
    [-0.000001, 0, 1, 0],
    [0, 0, 1, 0],
    [0.5, 0, 1, 0.5],
    [1, 0, 1, 1],
    [1.4, 0, 1, 1],
    [-0.5, -1, 1, -0.5],
  ])('clamps %p into [%p, %p] as %p', (value, min, max, expected) => {
    expect(clamp(value, min, max)).toBe(expected);
  });

  it('returns the minimum for NaN — fail closed', () => {
    expect(clamp(Number.NaN, 0, 1)).toBe(0);
  });
});

describe('roundMark', () => {
  it('rounds to five decimal places so stored marks are stable', () => {
    expect(roundMark(0.1 + 0.2)).toBe(0.3);
    expect(roundMark(2 / 3)).toBe(0.66667);
  });

  it('does not introduce a negative zero', () => {
    expect(Object.is(roundMark(-0.000001), 0)).toBe(true);
  });
});
