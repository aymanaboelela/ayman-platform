'use client';

import { useEffect, useRef, useState } from 'react';
import { copy, formatCopy } from '@ayman/contracts';
import { cn } from '@ayman/ui';

const WARN_THRESHOLD_SECONDS = 300;

/**
 * I7: the visible clock ticks every second, but a screen reader must not be
 * interrupted every second — `aria-live="assertive"` on a per-second region
 * makes the entire warn window (and the grace period) unusable with a
 * screen reader, cutting off the question stem/options being read out loud,
 * on repeat, for minutes. `role="timer"` already carries an implicit
 * `aria-live="off"` for exactly this reason; this component used to override
 * it, which is what created the bug. The fix keeps the visual per-second
 * display completely unchanged and adds a SEPARATE, visually-hidden
 * `aria-live="polite"` region that speaks only at meaningful, one-time
 * thresholds — 10 minutes, 5 minutes, 1 minute, 30 seconds — never on every
 * tick.
 */
const ANNOUNCE_THRESHOLDS_SECONDS = [600, 300, 60, 30] as const;

function announcementFor(thresholdSeconds: (typeof ANNOUNCE_THRESHOLDS_SECONDS)[number]): string {
  switch (thresholdSeconds) {
    case 600:
      return copy.quiz.timeRemaining10Min;
    case 300:
      return copy.quiz.timeRemaining5Min;
    case 60:
      return copy.quiz.timeRemaining1Min;
    case 30:
      return copy.quiz.timeRemaining30Sec;
  }
}

/**
 * Fires a polite announcement exactly once per threshold, the first time the
 * (main or grace) countdown drops to or below it. `crossed` persists for the
 * component's lifetime so re-renders (or a re-anchor that nudges the value
 * slightly) never repeat an announcement already made.
 */
function useThresholdAnnouncement(totalSeconds: number | null): string {
  const crossedRef = useRef<Set<number>>(new Set());
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (totalSeconds === null) return;
    for (const threshold of ANNOUNCE_THRESHOLDS_SECONDS) {
      if (totalSeconds <= threshold && !crossedRef.current.has(threshold)) {
        crossedRef.current.add(threshold);
        setAnnouncement(announcementFor(threshold));
      }
    }
  }, [totalSeconds]);

  return announcement;
}

/**
 * The server sends `deadlineAt` and `serverTime` together. We compute the
 * offset ONCE per anchor and count down against `performance.now()`, so:
 *   - a wrong client clock cannot buy extra time or steal it (the system
 *     clock is never read again after the anchor)
 *   - a system-clock jump mid-attempt does not warp the timer
 * Every autosave response carries a fresh `serverTime`, which RE-ANCHORS the
 * offset (see the effect below) — small clock drift is corrected over time,
 * but never by trusting the client's own clock in between. The countdown is
 * a DISPLAY; the server's deadline is the truth, and the submit endpoint
 * enforces it regardless of what this component showed.
 */
export function useServerCountdown(deadlineAt: string | null, serverTime: string): number | null {
  const anchorRef = useRef({ perf: 0, serverMs: 0 });
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const deadlineMs = deadlineAt ? new Date(deadlineAt).getTime() : null;

  useEffect(() => {
    anchorRef.current = { perf: performance.now(), serverMs: new Date(serverTime).getTime() };
  }, [serverTime]);

  useEffect(() => {
    // An untimed quiz (`deadlineMs === null`) never needs a tick — `remainingMs`
    // simply stays at its initial `null` and the component renders nothing.
    // (Not resetting it back to `null` here on purpose: doing so would be a
    // setState call synchronously inside the effect body for a case that
    // never actually recurs in this app — `deadlineAt` does not flip back to
    // null mid-attempt.)
    if (deadlineMs === null) return;
    // Re-bound to a plain `number`: TS's control-flow narrowing above does
    // not persist into the nested `tick` closure otherwise.
    const deadline = deadlineMs;

    function tick() {
      const elapsedSinceAnchor = performance.now() - anchorRef.current.perf;
      const nowServerMs = anchorRef.current.serverMs + elapsedSinceAnchor;
      // Never negative — a countdown reading "-0:03" is a support ticket in
      // its own right, and the sign carries no information a student needs.
      setRemainingMs(Math.max(0, deadline - nowServerMs));
    }

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
    // Re-runs (and re-ticks immediately) whenever `serverTime` re-anchors —
    // `deadlineMs` never changes for a given attempt (Q3), but is listed for
    // correctness if a caller ever passed a different one.
  }, [deadlineMs, serverTime]);

  return remainingMs;
}

export interface QuizTimerProps {
  deadlineAt: string | null;
  serverTime: string;
  /** Grace-period mode counts DOWN the grace instead, once the deadline passes. */
  graceSeconds: number;
  overdueHandling: 'autosubmit' | 'graceperiod' | 'autoabandon';
  /** Fires exactly once, the instant the countdown (or its grace) reaches zero. */
  onTimeUp: () => void;
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function QuizTimer({ deadlineAt, serverTime, graceSeconds, overdueHandling, onTimeUp }: QuizTimerProps) {
  const remainingMs = useServerCountdown(deadlineAt, serverTime);
  const gracePassedRef = useRef(false);
  const [inGrace, setInGrace] = useState(false);
  const graceRemainingMs = useServerCountdown(
    inGrace && deadlineAt ? new Date(new Date(deadlineAt).getTime() + graceSeconds * 1000).toISOString() : null,
    serverTime,
  );
  const firedRef = useRef(false);

  useEffect(() => {
    if (remainingMs === null) return;
    if (remainingMs <= 0 && overdueHandling === 'graceperiod' && graceSeconds > 0 && !gracePassedRef.current) {
      gracePassedRef.current = true;
      setInGrace(true);
      return;
    }
    if (remainingMs <= 0 && !inGrace && !firedRef.current) {
      firedRef.current = true;
      onTimeUp();
    }
  }, [remainingMs, overdueHandling, graceSeconds, inGrace, onTimeUp]);

  useEffect(() => {
    if (inGrace && graceRemainingMs !== null && graceRemainingMs <= 0 && !firedRef.current) {
      firedRef.current = true;
      onTimeUp();
    }
  }, [inGrace, graceRemainingMs, onTimeUp]);

  // Whichever countdown is currently on screen (grace, once it starts;
  // otherwise the main countdown) drives the threshold announcer. Called
  // unconditionally, before any early return, per the rules of hooks.
  const activeMs = inGrace ? graceRemainingMs : remainingMs;
  const activeSeconds = activeMs === null ? null : Math.ceil(activeMs / 1000);
  const announcement = useThresholdAnnouncement(activeSeconds);

  if (deadlineAt === null || remainingMs === null) return null;

  if (inGrace) {
    const graceSecondsLeft = Math.ceil((graceRemainingMs ?? 0) / 1000);
    return (
      <>
        <p role="timer" className="mono tabular-nums text-warn">
          {formatCopy(copy.quiz.graceRemaining, { seconds: graceSecondsLeft })}
        </p>
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </>
    );
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const isWarn = totalSeconds <= WARN_THRESHOLD_SECONDS;

  return (
    <>
      <div
        role="timer"
        className={cn('mono text-[length:var(--fs-title-4)] tabular-nums', isWarn ? 'text-warn' : 'text-fg')}
      >
        {formatClock(totalSeconds)}
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
