import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';
import { bucketLabel, duration, hours, maybe, pct } from './format';

const c = copy.analytics;

describe('pct', () => {
  it('renders «—» for an unknown rate, never «٠٪»', () => {
    // A rate with no denominator is unknown. 0% is a claim.
    expect(pct(null)).toBe(c.unknown);
    expect(pct(undefined)).toBe(c.unknown);
  });

  it('renders a real zero as zero', () => {
    expect(pct(0)).not.toBe(c.lessThanOnePercent);
    expect(pct(0)).not.toBe(c.unknown);
  });

  it('never rounds a nonzero rate down to zero', () => {
    // 4 watchers out of 1,791 — the case that shipped reading «٠٪», which is
    // what the screen shows when nobody has watched anything at all.
    expect(pct(4 / 1791)).toBe(c.lessThanOnePercent);
    expect(pct(0.0000001)).toBe(c.lessThanOnePercent);
  });

  it('never rounds not-quite-everyone up to everyone', () => {
    expect(pct(0.9999)).toBe(c.almostAllPercent);
    expect(pct(1)).not.toBe(c.almostAllPercent);
  });

  it('respects the requested precision before deciding it rounds to zero', () => {
    // At one decimal 0.4% is representable, so the guard must not fire.
    expect(pct(0.004, 1)).not.toBe(c.lessThanOnePercent);
    expect(pct(0.00004, 1)).toBe(c.lessThanOnePercent);
  });
});

describe('maybe', () => {
  it('is «—» for null rather than zero', () => {
    expect(maybe(null)).toBe(c.unknown);
    expect(maybe(0)).not.toBe(c.unknown);
  });
});

describe('duration', () => {
  it('says «أقل من دقيقة» rather than «٠ د»', () => {
    // «٠ د» reads as "no time at all", which is a different claim from "a
    // sitting shorter than a minute" — and the short sittings are the ones
    // worth noticing.
    expect(duration(30)).toBe(c.underMinute);
    expect(duration(0)).toBe(c.underMinute);
  });

  it('switches to minutes, then to hours', () => {
    expect(duration(600)).toContain(c.minutesShort);
    expect(duration(7200)).toContain(c.hoursShort);
  });

  it('is «—» when there is no duration to report', () => {
    expect(duration(null)).toBe(c.unknown);
  });
});

describe('hours', () => {
  it('is «—» for null, and carries the unit otherwise', () => {
    expect(hours(null)).toBe(c.unknown);
    expect(hours(3.5)).toContain(c.hoursShort);
  });
});

describe('bucketLabel', () => {
  it('labels bucket 1 as the 0–10 band and bucket 10 as 90–100', () => {
    expect(bucketLabel(1)).toMatch(/٠/);
    expect(bucketLabel(10)).toMatch(/١٠٠/);
  });
});
