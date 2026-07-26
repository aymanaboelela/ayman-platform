import { describe, expect, it } from 'vitest';
import {
  DWELL_COMPLETE_MS,
  HEARTBEAT_CLOCK_GRACE_SECONDS,
  MAX_HEARTBEAT_DELTA_SECONDS,
  VIDEO_POSITION_THRESHOLD,
  VIDEO_WATCHED_THRESHOLD,
  allowedHeartbeatSeconds,
  isVideoAutoComplete,
  videoCompletionFraction,
} from './progress';

const DURATION = 600; // a ten-minute lesson

describe('isVideoAutoComplete', () => {
  // THE test. If this ever goes green for the wrong reason, the whole
  // anti-scrub design is decorative. Do not delete it, do not weaken it.
  it('does NOT complete when the scrubber was dragged to the end', () => {
    expect(
      isVideoAutoComplete({
        durationSeconds: DURATION,
        maxPositionSeconds: DURATION, // dragged all the way to 10:00
        watchedSeconds: 4, // four seconds of actual playback
      }),
    ).toBe(false);
  });

  it('does NOT complete when the video was left playing but never seen to the end', () => {
    expect(
      isVideoAutoComplete({
        durationSeconds: DURATION,
        maxPositionSeconds: 500, // 83% — below the 95% position gate
        watchedSeconds: 500, // plenty of watch time
      }),
    ).toBe(false);
  });

  it('completes when both thresholds are met', () => {
    expect(
      isVideoAutoComplete({
        durationSeconds: DURATION,
        maxPositionSeconds: DURATION * VIDEO_POSITION_THRESHOLD,
        watchedSeconds: DURATION * VIDEO_WATCHED_THRESHOLD,
      }),
    ).toBe(true);
  });

  it('is exclusive one tick below either threshold', () => {
    const atPosition = DURATION * VIDEO_POSITION_THRESHOLD;
    const atWatched = DURATION * VIDEO_WATCHED_THRESHOLD;
    expect(
      isVideoAutoComplete({
        durationSeconds: DURATION,
        maxPositionSeconds: atPosition - 1,
        watchedSeconds: atWatched,
      }),
    ).toBe(false);
    expect(
      isVideoAutoComplete({
        durationSeconds: DURATION,
        maxPositionSeconds: atPosition,
        watchedSeconds: atWatched - 1,
      }),
    ).toBe(false);
  });

  it('never completes a video whose duration is unknown', () => {
    // A zero duration would make every threshold trivially satisfiable.
    expect(
      isVideoAutoComplete({ durationSeconds: 0, maxPositionSeconds: 0, watchedSeconds: 0 }),
    ).toBe(false);
  });
});

describe('videoCompletionFraction', () => {
  it('reports the watched fraction while the lesson is incomplete', () => {
    expect(
      videoCompletionFraction({
        durationSeconds: DURATION,
        maxPositionSeconds: 300,
        watchedSeconds: 300,
      }),
    ).toBe(0.5);
  });

  it('snaps to exactly 1 once the lesson auto-completes', () => {
    expect(
      videoCompletionFraction({
        durationSeconds: DURATION,
        maxPositionSeconds: DURATION,
        watchedSeconds: DURATION * VIDEO_WATCHED_THRESHOLD,
      }),
    ).toBe(1);
  });

  it('never exceeds 1 and never returns more than 4 decimals', () => {
    const value = videoCompletionFraction({
      durationSeconds: 7,
      maxPositionSeconds: 1,
      watchedSeconds: 1,
    });
    expect(value).toBeLessThanOrEqual(1);
    // numeric(5,4) — anything longer would be silently rounded by Postgres.
    expect(value.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });

  it('is 0 for an unknown duration rather than NaN or Infinity', () => {
    expect(
      videoCompletionFraction({ durationSeconds: 0, maxPositionSeconds: 99, watchedSeconds: 99 }),
    ).toBe(0);
  });
});

describe('allowedHeartbeatSeconds', () => {
  it('grants the claimed delta when real time actually elapsed', () => {
    expect(allowedHeartbeatSeconds(10, 10)).toBe(10);
  });

  it('refuses to credit more than the wall clock allows', () => {
    // A forged delta of 15s arriving 0s after the previous heartbeat can only
    // ever buy the grace window, never the claim.
    expect(allowedHeartbeatSeconds(15, 0)).toBe(HEARTBEAT_CLOCK_GRACE_SECONDS);
  });

  it('caps a single claim at MAX_HEARTBEAT_DELTA_SECONDS regardless of elapsed time', () => {
    // A tab suspended for an hour cannot come back and claim an hour.
    expect(allowedHeartbeatSeconds(3600, 3600)).toBe(MAX_HEARTBEAT_DELTA_SECONDS);
  });

  it('makes flooding strictly worse than honest watching', () => {
    // The route throttle allows 15 heartbeats per minute. Fired back-to-back
    // with zero elapsed time between them, they buy 15 * 2 = 30 seconds —
    // half of what one honest minute of playback yields.
    const flooded = Array.from({ length: 15 }, () => allowedHeartbeatSeconds(15, 0)).reduce(
      (total, seconds) => total + seconds,
      0,
    );
    expect(flooded).toBe(30);
    expect(flooded).toBeLessThan(60);
  });

  it('clamps negative and fractional inputs instead of trusting them', () => {
    expect(allowedHeartbeatSeconds(-50, 10)).toBe(0);
    expect(allowedHeartbeatSeconds(10, -50)).toBe(HEARTBEAT_CLOCK_GRACE_SECONDS);
    expect(allowedHeartbeatSeconds(9.9, 9.9)).toBe(9);
  });
});

describe('dwell constant', () => {
  it('is the 5000ms the spec fixes for text and attachment lessons', () => {
    expect(DWELL_COMPLETE_MS).toBe(5000);
  });
});
