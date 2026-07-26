'use client';

import { useEffect, useRef, useState } from 'react';
import { copy, formatCopy } from '@ayman/contracts';
import { cn } from '@ayman/ui';

const WARN_THRESHOLD_SECONDS = 300;

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

  if (deadlineAt === null || remainingMs === null) return null;

  if (inGrace) {
    const graceSecondsLeft = Math.ceil((graceRemainingMs ?? 0) / 1000);
    return (
      <p role="timer" aria-live="assertive" className="mono tabular-nums text-warn">
        {formatCopy(copy.quiz.graceRemaining, { seconds: graceSecondsLeft })}
      </p>
    );
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const isWarn = totalSeconds <= WARN_THRESHOLD_SECONDS;

  return (
    <div
      role="timer"
      aria-live={isWarn ? 'assertive' : 'off'}
      className={cn('mono text-[length:var(--fs-title-4)] tabular-nums', isWarn ? 'text-warn' : 'text-fg')}
    >
      {formatClock(totalSeconds)}
    </div>
  );
}
