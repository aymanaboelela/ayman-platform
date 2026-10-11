import { describe, expect, it } from 'vitest';
import { closesAfter, windowLength } from './exam-time';

describe('«يفضل مفتوح قد إيه؟» ↔ «يقفل»', () => {
  it('fills the close from the open and a length', () => {
    expect(closesAfter('2026-10-16T20:00', 24, 'hours')).toBe('2026-10-17T20:00');
    expect(closesAfter('2026-10-16T20:00', 2, 'days')).toBe('2026-10-18T20:00');
    expect(closesAfter('2026-10-16T20:00', 1.5, 'hours')).toBe('2026-10-16T21:30');
  });

  it('leaves the close alone when the open or the length is unusable', () => {
    expect(closesAfter('', 24, 'hours')).toBe('');
    expect(closesAfter('2026-10-16T20:00', 0, 'hours')).toBe('');
  });

  it('reads whole days as days and anything else as hours', () => {
    expect(windowLength('2026-10-16T20:00', '2026-10-18T20:00')).toEqual({ amount: 2, unit: 'days' });
    expect(windowLength('2026-10-16T20:00', '2026-10-17T02:00')).toEqual({ amount: 6, unit: 'hours' });
    expect(windowLength('2026-10-16T20:00', '2026-10-16T19:00')).toBeNull();
  });
});
