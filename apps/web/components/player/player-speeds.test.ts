import {
  HEARTBEAT_CLOCK_GRACE_SECONDS,
  HEARTBEAT_INTERVAL_MS,
  MAX_HEARTBEAT_DELTA_SECONDS,
  MAX_PLAYBACK_RATE,
  VIDEO_POSITION_THRESHOLD,
  VIDEO_WATCHED_THRESHOLD,
  isVideoAutoComplete,
} from '@ayman/contracts/progress';
import { describe, expect, it } from 'vitest';
import { SPEEDS } from './player-chrome';

/**
 * The speed menu and the completion rule have to agree, and nothing else ties
 * them together: a speed added here above `MAX_PLAYBACK_RATE` is a speed at
 * which a lecture watched start to finish never leaves «المتراكم».
 */
describe('player speeds vs the completion rule', () => {
  it('offers no speed faster than the rule was written for', () => {
    expect(Math.max(...SPEEDS)).toBeLessThanOrEqual(MAX_PLAYBACK_RATE);
  });

  it.each(SPEEDS.map((speed) => [speed]))('a whole lecture watched at %s× completes', (speed) => {
    const duration = 3600;
    const flushSeconds = HEARTBEAT_INTERVAL_MS / 1000;
    // What the server grants per flush: the claim (video seconds, capped by the
    // client) intersected with its own clock — `allowedHeartbeatSeconds`.
    const perFlush = Math.min(
      Math.min(flushSeconds * speed, MAX_HEARTBEAT_DELTA_SECONDS),
      flushSeconds + HEARTBEAT_CLOCK_GRACE_SECONDS,
    );
    const watchedSeconds = Math.min((duration / speed / flushSeconds) * perFlush, duration);

    expect(
      isVideoAutoComplete({ durationSeconds: duration, maxPositionSeconds: duration * VIDEO_POSITION_THRESHOLD, watchedSeconds }),
    ).toBe(true);
    expect(watchedSeconds).toBeGreaterThanOrEqual(duration * VIDEO_WATCHED_THRESHOLD);
  });
});
