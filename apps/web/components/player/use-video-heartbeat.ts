'use client';

import { useCallback, useEffect, useRef } from 'react';
import { HEARTBEAT_INTERVAL_MS, MAX_HEARTBEAT_DELTA_SECONDS } from '@ayman/contracts';
import type { HeartbeatResponse } from '@ayman/contracts';
import { postHeartbeat } from '@/lib/progress-client';
import { YT_STATE, type YouTubePlayer } from '@/lib/youtube';

const TICK_MS = 1_000;
const TICKS_PER_FLUSH = HEARTBEAT_INTERVAL_MS / TICK_MS;

/**
 * A seek shows up as the current time jumping by more than one tick. Counting
 * it as watch time would be dishonest reporting; the server would clamp it
 * anyway, but the client should not be the one lying.
 */
const MAX_HONEST_TICK_ADVANCE = 2;

export interface UseVideoHeartbeatOptions {
  lessonId: string;
  player: YouTubePlayer | null;
  onResponse: (response: HeartbeatResponse) => void;
  onError: () => void;
}

/**
 * Ticks once a second while the video is actually PLAYING, and flushes an
 * accumulated `{position, delta}` every ten seconds.
 *
 * The client is a reporter, not an authority: it never computes a percentage,
 * never decides completion, and its `delta` is intersected with the server's
 * own wall clock on arrival. Everything here is about reporting *honestly* —
 * the security property does not depend on it.
 */
export function useVideoHeartbeat({
  lessonId,
  player,
  onResponse,
  onError,
}: UseVideoHeartbeatOptions): void {
  const deltaRef = useRef(0);
  const lastTimeRef = useRef(0);
  const inFlightRef = useRef(false);

  const flush = useCallback(
    async (keepalive: boolean) => {
      if (!player || inFlightRef.current) return;

      const pending = Math.min(Math.round(deltaRef.current), MAX_HEARTBEAT_DELTA_SECONDS);
      const position = Math.max(Math.floor(player.getCurrentTime()), 0);
      if (pending <= 0 && !keepalive) return;

      inFlightRef.current = true;
      // Cleared optimistically so a slow request cannot double-count, and
      // restored below if the POST fails — losing ten seconds of a student's
      // watch time to one flaky request is a real complaint.
      deltaRef.current = 0;

      try {
        const response = await postHeartbeat(lessonId, { position, delta: pending }, { keepalive });
        onResponse(response);
      } catch {
        deltaRef.current = Math.min(deltaRef.current + pending, MAX_HEARTBEAT_DELTA_SECONDS);
        onError();
      } finally {
        inFlightRef.current = false;
      }
    },
    [lessonId, onError, onResponse, player],
  );

  useEffect(() => {
    if (!player) return;

    lastTimeRef.current = player.getCurrentTime();
    let ticks = 0;

    const interval = window.setInterval(() => {
      const now = player.getCurrentTime();
      const advanced = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (player.getPlayerState() === YT_STATE.PLAYING) {
        // A jump larger than one tick is a seek, not playback.
        if (advanced > 0 && advanced <= MAX_HONEST_TICK_ADVANCE) {
          deltaRef.current += advanced;
        }
      }

      ticks += 1;
      if (ticks >= TICKS_PER_FLUSH) {
        ticks = 0;
        void flush(false);
      }
    }, TICK_MS);

    /**
     * Flush before the page can go away. `keepalive: true` rather than
     * `navigator.sendBeacon` because beacons cannot set the CSRF header the
     * API requires on every state-changing method.
     */
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void flush(true);
    };
    document.addEventListener('visibilitychange', onHidden);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onHidden);
      void flush(true);
    };
  }, [flush, player]);
}
