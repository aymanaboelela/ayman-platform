import { describe, expect, it } from 'vitest';
import { skipCuts, trimWindow, watchedAt } from './video-trim';

const trim = { start: 10, end: 100, cuts: [{ from: 30, to: 40 }, { from: 60, to: 65 }] };

describe('video-trim', () => {
  it('plays between the chosen start and end, or the whole file', () => {
    expect(trimWindow(trim, 120)).toEqual({ start: 10, end: 100 });
    expect(trimWindow(null, 120)).toEqual({ start: 0, end: 120 });
    expect(trimWindow({ start: 5, end: null, cuts: [] }, 120)).toEqual({ start: 5, end: 120 });
  });

  it('jumps over a cut, never into one', () => {
    expect(skipCuts(35, trim)).toBe(40);
    expect(skipCuts(40, trim)).toBe(40);
    expect(skipCuts(20, trim)).toBe(20);
  });

  it('counts only what the student sees', () => {
    expect(watchedAt(10, trim)).toBe(0);
    expect(watchedAt(50, trim)).toBe(30); // 40 in, minus the 10 s cut
    expect(watchedAt(100, trim)).toBe(75); // 90 minus both cuts (15)
  });
});
