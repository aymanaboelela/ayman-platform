import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PACING,
  cairoParts,
  estimateMinutes,
  fromCairoWall,
  maySendAt,
  nextSend,
  rolled,
  withinWindow,
  type Pacing,
  type RunState,
} from '@ayman/contracts/marketing/pacing';

/** A fresh campaign that has sent nothing. */
const FRESH: RunState = { sentInBatch: 0, sentToday: 0, dayKey: null };

/** Cairo instant helper — reads as wall time in the assertions below. */
const cairo = (
  y: number,
  m: number,
  d: number,
  h: number,
  min = 0,
): Date => fromCairoWall(y, m, d, h, min);

describe('cairo wall clock', () => {
  it('is +02:00 in winter', () => {
    // 2026-01-15 12:00 Cairo is 10:00 UTC.
    expect(cairo(2026, 1, 15, 12).toISOString()).toBe('2026-01-15T10:00:00.000Z');
  });

  it('is +03:00 in summer — Egypt has DST again since 2023', () => {
    // 2026-07-15 12:00 Cairo is 09:00 UTC. A hard-coded +02:00 would have
    // made this 10:00Z and shifted the whole sending window by an hour.
    expect(cairo(2026, 7, 15, 12).toISOString()).toBe('2026-07-15T09:00:00.000Z');
  });

  it('round-trips an instant back to the same wall fields', () => {
    const at = cairo(2026, 8, 23, 21, 30);
    expect(cairoParts(at)).toMatchObject({ day: '2026-08-23', hour: 21, minute: 30 });
  });
});

describe('withinWindow', () => {
  it('leaves an instant inside the window alone', () => {
    const at = cairo(2026, 8, 23, 15);
    expect(withinWindow(at, DEFAULT_PACING).getTime()).toBe(at.getTime());
  });

  it('pushes an early-morning instant to this morning’s opening', () => {
    expect(withinWindow(cairo(2026, 8, 23, 6), DEFAULT_PACING).toISOString()).toBe(
      cairo(2026, 8, 23, 10).toISOString(),
    );
  });

  it('pushes a night instant to tomorrow’s opening', () => {
    expect(withinWindow(cairo(2026, 8, 23, 23, 40), DEFAULT_PACING).toISOString()).toBe(
      cairo(2026, 8, 24, 10).toISOString(),
    );
  });

  it('treats the end hour as exclusive — 22:00 is already closed', () => {
    expect(withinWindow(cairo(2026, 8, 23, 22), DEFAULT_PACING).toISOString()).toBe(
      cairo(2026, 8, 24, 10).toISOString(),
    );
  });

  it('rolls the month over', () => {
    expect(withinWindow(cairo(2026, 8, 31, 23), DEFAULT_PACING).toISOString()).toBe(
      cairo(2026, 9, 1, 10).toISOString(),
    );
  });
});

describe('maySendAt', () => {
  it('refuses outside the window', () => {
    expect(maySendAt(cairo(2026, 8, 23, 3), DEFAULT_PACING, FRESH)).toBe(false);
  });

  it('refuses once the day’s cap is spent', () => {
    const spent: RunState = { sentInBatch: 0, sentToday: 200, dayKey: '2026-08-23' };
    expect(maySendAt(cairo(2026, 8, 23, 15), DEFAULT_PACING, spent)).toBe(false);
  });

  it('allows the same counters on the NEXT day — the cap is per day', () => {
    const spent: RunState = { sentInBatch: 0, sentToday: 200, dayKey: '2026-08-23' };
    expect(maySendAt(cairo(2026, 8, 24, 15), DEFAULT_PACING, spent)).toBe(true);
  });
});

describe('rolled', () => {
  it('zeroes the daily counter when the Cairo day has turned', () => {
    const state: RunState = { sentInBatch: 7, sentToday: 120, dayKey: '2026-08-23' };
    expect(rolled(state, cairo(2026, 8, 24, 11))).toEqual({
      sentInBatch: 7,
      sentToday: 0,
      dayKey: '2026-08-24',
    });
  });

  it('leaves the counters alone within the same day', () => {
    const state: RunState = { sentInBatch: 7, sentToday: 120, dayKey: '2026-08-23' };
    expect(rolled(state, cairo(2026, 8, 23, 21))).toBe(state);
  });
});

describe('nextSend', () => {
  const now = cairo(2026, 8, 23, 12);

  it('uses the low end of the range at jitter 0', () => {
    const next = nextSend(now, DEFAULT_PACING, FRESH, 0);
    expect(next.reason).toBe('gap');
    expect((next.at.getTime() - now.getTime()) / 1000).toBe(30);
  });

  it('uses the high end at jitter just under 1 — the range is inclusive', () => {
    const next = nextSend(now, DEFAULT_PACING, FRESH, 0.999);
    expect((next.at.getTime() - now.getTime()) / 1000).toBe(90);
  });

  it('counts the message that was just sent', () => {
    expect(nextSend(now, DEFAULT_PACING, FRESH, 0).state).toEqual({
      sentInBatch: 1,
      sentToday: 1,
      dayKey: '2026-08-23',
    });
  });

  it('pauses after a full batch and starts the next one at zero', () => {
    const state: RunState = { sentInBatch: 29, sentToday: 29, dayKey: '2026-08-23' };
    const next = nextSend(now, DEFAULT_PACING, state, 0.5);
    expect(next.reason).toBe('batch-pause');
    expect((next.at.getTime() - now.getTime()) / 60000).toBe(10);
    expect(next.state.sentInBatch).toBe(0);
    expect(next.state.sentToday).toBe(30);
  });

  it('waits for tomorrow’s window once the cap is reached, not ten minutes', () => {
    const state: RunState = { sentInBatch: 29, sentToday: 199, dayKey: '2026-08-23' };
    const next = nextSend(now, DEFAULT_PACING, state, 0.5);
    expect(next.reason).toBe('daily-cap');
    expect(next.at.toISOString()).toBe(cairo(2026, 8, 24, 10).toISOString());
    // The cap outranks the batch pause: a burst boundary at the same moment
    // must not schedule 10 minutes and then be blocked for eleven hours.
    expect(next.state.sentInBatch).toBe(0);
  });

  it('clamps a gap that would land after closing time', () => {
    const late = cairo(2026, 8, 23, 21, 59);
    const next = nextSend(late, DEFAULT_PACING, FRESH, 0.999);
    expect(next.reason).toBe('outside-window');
    expect(next.at.toISOString()).toBe(cairo(2026, 8, 24, 10).toISOString());
  });

  it('rolls the daily counter itself when resumed on a later day', () => {
    const stale: RunState = { sentInBatch: 0, sentToday: 200, dayKey: '2026-08-20' };
    const next = nextSend(now, DEFAULT_PACING, stale, 0);
    expect(next.reason).toBe('gap');
    expect(next.state).toEqual({ sentInBatch: 1, sentToday: 1, dayKey: '2026-08-23' });
  });

  it('never schedules a gap shorter than the minimum, at any jitter', () => {
    for (let i = 0; i < 100; i += 1) {
      const next = nextSend(now, DEFAULT_PACING, FRESH, i / 100);
      const seconds = (next.at.getTime() - now.getTime()) / 1000;
      expect(seconds).toBeGreaterThanOrEqual(DEFAULT_PACING.minDelaySeconds);
      expect(seconds).toBeLessThanOrEqual(DEFAULT_PACING.maxDelaySeconds);
    }
  });
});

describe('estimateMinutes', () => {
  it('is zero for an empty audience', () => {
    expect(estimateMinutes(0, DEFAULT_PACING)).toBe(0);
  });

  it('counts the batch pauses inside a single burst run', () => {
    // 60 messages at a 60s mean = 60 minutes, plus one pause between the two
    // bursts (the pause after the last message is not waited on).
    expect(estimateMinutes(60, DEFAULT_PACING)).toBe(70);
  });

  it('spreads a cohort over days once the cap bites', () => {
    // 4500 students at 200/day is 23 days — the number that should make
    // somebody pick a smaller audience.
    const days = estimateMinutes(4500, DEFAULT_PACING) / 60 / 24;
    expect(days).toBeGreaterThan(21);
    expect(days).toBeLessThan(25);
  });

  it('scales with the cap rather than ignoring it', () => {
    const slow = estimateMinutes(1000, DEFAULT_PACING);
    const fast = estimateMinutes(1000, { ...DEFAULT_PACING, dailyCap: 1000 });
    expect(fast).toBeLessThan(slow);
  });
});

describe('a custom pacing', () => {
  const aggressive: Pacing = {
    minDelaySeconds: 5,
    maxDelaySeconds: 5,
    batchSize: 0,
    batchPauseMinutes: 0,
    dailyCap: 10_000,
    windowStartHour: 0,
    windowEndHour: 24,
  };

  it('honours a zero batch size as "no bursts" rather than pausing forever', () => {
    const now = cairo(2026, 8, 23, 3);
    const next = nextSend(now, aggressive, { sentInBatch: 500, sentToday: 500, dayKey: '2026-08-23' }, 0);
    expect(next.reason).toBe('gap');
    expect((next.at.getTime() - now.getTime()) / 1000).toBe(5);
  });

  it('never clamps when the window is the whole day', () => {
    const at = cairo(2026, 8, 23, 23, 59);
    expect(withinWindow(at, aggressive).getTime()).toBe(at.getTime());
  });
});
