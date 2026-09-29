import { RETENTION_STEPS, VIDEO_SERIES_MAX_DAYS } from '@ayman/contracts/admin/video-analytics';
import { cairoDayKey } from './analytics-shared';
import {
  addDays,
  cairoMidnight,
  dailySeries,
  hourSeries,
  perView,
  periodStart,
  retentionCurve,
  seriesStart,
} from './video-analytics-math';

describe('cairoMidnight', () => {
  it('is the first instant of that Cairo day, for every day of a year — DST days included', () => {
    // Asserted as an invariant rather than against hand-written offsets: the
    // two DST switches move year to year, and a table of them is one more
    // thing to be wrong. Whatever the offset, the instant must fall ON the day
    // and the millisecond before it must fall on the day before.
    let day = '2026-01-01';
    while (day < '2027-01-01') {
      const start = cairoMidnight(day);
      expect(cairoDayKey(start)).toBe(day);
      expect(cairoDayKey(new Date(start.getTime() - 1))).toBe(addDays(day, -1));
      day = addDays(day, 1);
    }
  });

  it('lands three hours before UTC midnight in summer and two in winter', () => {
    expect(cairoMidnight('2026-08-15').toISOString()).toBe('2026-08-14T21:00:00.000Z');
    expect(cairoMidnight('2026-12-15').toISOString()).toBe('2026-12-14T22:00:00.000Z');
  });
});

describe('periodStart', () => {
  // 01:30 in Cairo on the 29th — the hour a UTC-based window gets wrong.
  const now = new Date('2026-09-28T22:30:00Z');

  it('counts today as the last of the N days', () => {
    expect(cairoDayKey(now)).toBe('2026-09-29');
    expect(cairoDayKey(periodStart('7d', now)!)).toBe('2026-09-23');
    expect(cairoDayKey(periodStart('28d', now)!)).toBe('2026-09-02');
    expect(cairoDayKey(periodStart('90d', now)!)).toBe('2026-07-02');
  });

  it('starts on a Cairo midnight, not N×24h ago', () => {
    expect(periodStart('7d', now)!.toISOString()).toBe('2026-09-22T21:00:00.000Z');
  });

  it('is open-ended for all time', () => {
    expect(periodStart('all', now)).toBeNull();
  });
});

describe('seriesStart', () => {
  const now = new Date('2026-09-29T09:00:00Z');

  it('follows the period when it has one', () => {
    expect(seriesStart('28d', now, new Date('2020-01-01T00:00:00Z'))).toEqual(periodStart('28d', now));
  });

  it('starts all-time at the first view', () => {
    expect(cairoDayKey(seriesStart('all', now, new Date('2026-08-04T00:45:07Z')))).toBe('2026-08-04');
  });

  it('caps all-time at a year of bars', () => {
    const start = seriesStart('all', now, new Date('2020-01-01T00:00:00Z'));
    expect(cairoDayKey(start)).toBe(addDays('2026-09-29', -(VIDEO_SERIES_MAX_DAYS - 1)));
  });

  it('draws at least a week, so a video first watched today still gets a line', () => {
    expect(cairoDayKey(seriesStart('all', now, null))).toBe('2026-09-23');
    expect(cairoDayKey(seriesStart('all', now, new Date('2026-09-29T08:00:00Z')))).toBe('2026-09-23');
  });
});

describe('dailySeries', () => {
  it('has every day of the window, today last, zeros where nothing happened', () => {
    const now = new Date('2026-09-29T09:00:00Z');
    const series = dailySeries(periodStart('7d', now)!, now, [
      { day: '2026-09-24', views: 3, viewers: 2, watchSeconds: 600 },
    ]);
    expect(series.map((point) => point.date)).toEqual([
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
    ]);
    expect(series[1]).toEqual({ date: '2026-09-24', views: 3, viewers: 2, watchMinutes: 10 });
    expect(series[0]).toEqual({ date: '2026-09-23', views: 0, viewers: 0, watchMinutes: 0 });
  });
});

describe('retentionCurve', () => {
  it('is a suffix sum: point k is everyone who reached step k or further', () => {
    // Four viewers: one stopped at the start, one at 25%, two finished.
    const curve = retentionCurve([
      { step: 0, n: 1 },
      { step: 5, n: 1 },
      { step: 20, n: 2 },
    ])!;
    expect(curve).toHaveLength(RETENTION_STEPS + 1);
    expect(curve[0]).toBe(1);
    expect(curve[1]).toBe(0.75);
    expect(curve[5]).toBe(0.75);
    expect(curve[6]).toBe(0.5);
    expect(curve[20]).toBe(0.5);
  });

  it('never rises as the video goes on', () => {
    const curve = retentionCurve([
      { step: 3, n: 7 },
      { step: 11, n: 2 },
      { step: 19, n: 5 },
    ])!;
    for (let step = 1; step < curve.length; step += 1) {
      expect(curve[step]!).toBeLessThanOrEqual(curve[step - 1]!);
    }
  });

  it('merges repeated steps and clamps anything out of range', () => {
    const curve = retentionCurve([
      { step: 20, n: 1 },
      { step: 20, n: 1 },
      { step: 25, n: 2 },
      { step: -1, n: 4 },
    ])!;
    expect(curve[20]).toBe(0.5);
    expect(curve[1]).toBe(0.5);
  });

  it('is null over nobody, not a flat line at zero', () => {
    expect(retentionCurve([])).toBeNull();
    expect(retentionCurve([{ step: 4, n: 0 }])).toBeNull();
  });
});

describe('hourSeries', () => {
  it('has all 24 hours and ignores anything outside them', () => {
    const hours = hourSeries([
      { hour: 0, n: 2 },
      { hour: 23, n: 5 },
      { hour: 24, n: 9 },
    ]);
    expect(hours).toHaveLength(24);
    expect(hours[0]).toBe(2);
    expect(hours[23]).toBe(5);
    expect(hours.reduce((sum, n) => sum + n, 0)).toBe(7);
  });
});

describe('perView', () => {
  it('is unknown with no views, never zero', () => {
    expect(perView(0, 0)).toBeNull();
    expect(perView(900, 3)).toBe(300);
  });
});
