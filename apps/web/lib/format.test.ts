import { describe, expect, it } from 'vitest';
import { formatDuration, formatRemaining } from './format';

describe('formatDuration', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(599)).toBe('9:59');
  });

  it('formats an hour or more as h:mm:ss', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3671)).toBe('1:01:11');
  });

  it('uses Western digits, never Arabic-Indic', () => {
    // §4.1: Western digits everywhere, including chrome. This is a
    // programming platform — timers, scores and code all need them.
    expect(formatDuration(75)).toMatch(/^[0-9:]+$/);
  });

  it('never renders NaN or a negative clock', () => {
    expect(formatDuration(-30)).toBe('0:00');
    expect(formatDuration(Number.NaN)).toBe('0:00');
  });
});

describe('formatRemaining', () => {
  it('rounds up to whole minutes above a minute', () => {
    expect(formatRemaining(61)).toBe('2:00');
    expect(formatRemaining(600)).toBe('10:00');
  });

  it('keeps seconds under a minute', () => {
    expect(formatRemaining(45)).toBe('0:45');
  });
});
