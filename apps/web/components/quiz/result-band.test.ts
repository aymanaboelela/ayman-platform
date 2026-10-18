import { describe, expect, it } from 'vitest';
import { resultBand } from './result-band';

describe('resultBand', () => {
  it('follows the paper’s own verdict, not fixed cut-offs', () => {
    // Passed at 60% on a 50% paper: a pass band. The redesign banded this red
    // («لا مش هينفع كده») under its own pass badge.
    expect(resultBand({ percent: 60, passed: true, passPercent: 50, outstanding: false })).toBe('pass');
    // 75% on a 80% paper is under ITS line.
    expect(resultBand({ percent: 75, passed: false, passPercent: 80, outstanding: false })).toBe('low');
  });

  it('calls «امتياز» from 90 up — on a paper that passed', () => {
    expect(resultBand({ percent: 90, passed: true, passPercent: 50, outstanding: false })).toBe('high');
    expect(resultBand({ percent: 95, passed: false, passPercent: 96, outstanding: false })).toBe('low');
  });

  it('gives no band at all while marks are outstanding', () => {
    expect(resultBand({ percent: 30, passed: false, passPercent: 50, outstanding: true })).toBe('pending');
  });

  it('falls back to the pass line when the verdict is missing', () => {
    expect(resultBand({ percent: 50, passed: null, passPercent: 50, outstanding: false })).toBe('pass');
    expect(resultBand({ percent: 49, passed: null, passPercent: 50, outstanding: false })).toBe('low');
    expect(resultBand({ percent: null, passed: null, passPercent: 50, outstanding: false })).toBe('low');
  });
});
