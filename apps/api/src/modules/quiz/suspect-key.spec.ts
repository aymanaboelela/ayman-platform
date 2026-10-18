import { isSuspectKey } from './analytics.service';

/**
 * The line both the item-analysis chip and the proactive alert draw, pinned
 * for the two-option case — on a true/false question a reversed key is THE
 * common failure (2026-10-18: nine of nine students on the right option, all
 * marked wrong).
 */
describe('isSuspectKey on a true/false question', () => {
  const key = (picks: number) => ({ fraction: 1, picks });
  const other = (picks: number) => ({ fraction: 0, picks });

  it('flags five of five on the unkeyed option', () => {
    expect(isSuspectKey([other(5)])).toBe(true);
    expect(isSuspectKey([key(0), other(5)])).toBe(true);
  });

  it('flags 80% on the unkeyed option at the five-answer floor', () => {
    expect(isSuspectKey([key(1), other(4)])).toBe(true);
    expect(isSuspectKey([key(2), other(8)])).toBe(true);
  });

  it('needs five answers before anything counts as evidence', () => {
    expect(isSuspectKey([other(4)])).toBe(false);
  });

  it('leaves a question most students got right alone', () => {
    expect(isSuspectKey([key(4), other(1)])).toBe(false);
    expect(isSuspectKey([key(9)])).toBe(false);
  });
});
