import { describe, expect, it } from 'vitest';
import {
  DEVICE_WARMUP,
  cairoDayStart,
  ceilingResumesAt,
  deviceCeiling,
  warmupDay,
} from '@ayman/contracts/marketing/device-ceiling';
import { fromCairoWall } from '@ayman/contracts/marketing/pacing';

const cairo = (y: number, m: number, d: number, h: number, min = 0): Date => fromCairoWall(y, m, d, h, min);

describe('warmupDay', () => {
  it('is 0 before the number has ever sent', () => {
    expect(warmupDay(null, cairo(2026, 10, 28, 12))).toBe(0);
  });

  it('counts Cairo calendar days, not 24-hour spans', () => {
    // 23:30 on the 28th to 00:30 on the 29th is one hour — and one DAY.
    expect(warmupDay(cairo(2026, 10, 28, 23, 30), cairo(2026, 10, 29, 0, 30))).toBe(1);
    expect(warmupDay(cairo(2026, 10, 28, 10), cairo(2026, 10, 28, 21))).toBe(0);
  });

  it('never goes negative on a clock skew', () => {
    expect(warmupDay(cairo(2026, 10, 29, 10), cairo(2026, 10, 28, 10))).toBe(0);
  });
});

describe('deviceCeiling', () => {
  const first = cairo(2026, 10, 28, 11);

  it('starts low on a brand-new number', () => {
    expect(deviceCeiling(null, cairo(2026, 10, 28, 11))).toEqual({ limit: 40, day: 0, warmingUp: true });
  });

  it('climbs on the ramp', () => {
    expect(deviceCeiling(first, cairo(2026, 10, 30, 11)).limit).toBe(40); // day 2
    expect(deviceCeiling(first, cairo(2026, 10, 31, 11)).limit).toBe(80); // day 3
    expect(deviceCeiling(first, cairo(2026, 11, 4, 11)).limit).toBe(150); // day 7
  });

  it('settles after two weeks', () => {
    const settled = deviceCeiling(first, cairo(2026, 11, 11, 11)); // day 14
    expect(settled.limit).toBe(DEVICE_WARMUP[DEVICE_WARMUP.length - 1]!.limit);
    expect(settled.warmingUp).toBe(false);
  });

  it('the ramp only ever goes up', () => {
    for (let i = 1; i < DEVICE_WARMUP.length; i += 1) {
      expect(DEVICE_WARMUP[i]!.limit).toBeGreaterThan(DEVICE_WARMUP[i - 1]!.limit);
      expect(DEVICE_WARMUP[i]!.fromDay).toBeGreaterThan(DEVICE_WARMUP[i - 1]!.fromDay);
    }
  });
});

describe('cairoDayStart / ceilingResumesAt', () => {
  it('the day starts at Cairo midnight', () => {
    expect(cairoDayStart(cairo(2026, 10, 28, 15, 20)).toISOString()).toBe(cairo(2026, 10, 28, 0).toISOString());
  });

  it('resumes at tomorrow’s window, not midnight', () => {
    expect(ceilingResumesAt(cairo(2026, 10, 28, 15), { windowStartHour: 10 }).toISOString()).toBe(
      cairo(2026, 10, 29, 10).toISOString(),
    );
  });
});
