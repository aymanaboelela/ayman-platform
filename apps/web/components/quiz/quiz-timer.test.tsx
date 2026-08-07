import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuizTimer } from './quiz-timer';

/**
 * `performance.now()` is spied and driven EXPLICITLY, decoupled from
 * vitest's fake `Date` — this is the whole point of the component under
 * test (it must never read the system clock for elapsed time), so the test
 * harness has to be able to move one without the other to prove it.
 */
let perfNow = 0;

function advance(ms: number) {
  perfNow += ms;
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('QuizTimer / useServerCountdown', () => {
  beforeEach(() => {
    perfNow = 0;
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => perfNow);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const SERVER_TIME = '2026-01-01T00:00:00.000Z';
  const DEADLINE = '2026-01-01T00:10:00.000Z'; // 10 minutes out

  it('ignores a client clock that is an hour fast', () => {
    // The SYSTEM clock is set an hour ahead of the server. A buggy
    // implementation reading Date.now() for elapsed time would think the
    // deadline had already passed; this one must not be affected at all.
    vi.setSystemTime(new Date('2026-01-01T01:00:00.000Z'));

    render(
      <QuizTimer
        deadlineAt={DEADLINE}
        serverTime={SERVER_TIME}
        graceSeconds={60}
        overdueHandling="autosubmit"
        onTimeUp={vi.fn()}
      />,
    );

    expect(screen.getByRole('timer').textContent).toBe('10:00');
  });

  it('re-anchors on a fresh serverTime from an autosave', () => {
    const { rerender } = render(
      <QuizTimer
        deadlineAt={DEADLINE}
        serverTime={SERVER_TIME}
        graceSeconds={60}
        overdueHandling="autosubmit"
        onTimeUp={vi.fn()}
      />,
    );

    advance(5_000);
    expect(screen.getByRole('timer').textContent).toBe('09:55');

    // An autosave response reports the server was actually 10s further along
    // than the client's own perf-based guess assumed — the display must jump
    // to reflect the new anchor immediately, not keep counting from the stale one.
    rerender(
      <QuizTimer
        deadlineAt={DEADLINE}
        serverTime="2026-01-01T00:00:10.000Z"
        graceSeconds={60}
        overdueHandling="autosubmit"
        onTimeUp={vi.fn()}
      />,
    );

    expect(screen.getByRole('timer').textContent).toBe('09:50');
  });

  it('fires exactly one submit when it reaches zero, even across re-renders', () => {
    const onTimeUp = vi.fn();
    const { rerender } = render(
      <QuizTimer
        deadlineAt="2026-01-01T00:00:01.000Z"
        serverTime={SERVER_TIME}
        graceSeconds={0}
        overdueHandling="autosubmit"
        onTimeUp={onTimeUp}
      />,
    );

    advance(2_000);
    expect(onTimeUp).toHaveBeenCalledTimes(1);

    // Re-rendering with identical props (e.g. a parent state change
    // elsewhere) must not re-fire the callback.
    rerender(
      <QuizTimer
        deadlineAt="2026-01-01T00:00:01.000Z"
        serverTime={SERVER_TIME}
        graceSeconds={0}
        overdueHandling="autosubmit"
        onTimeUp={onTimeUp}
      />,
    );
    advance(1_000);
    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });

  it('never renders a negative time', () => {
    render(
      <QuizTimer
        deadlineAt="2026-01-01T00:00:01.000Z"
        serverTime={SERVER_TIME}
        graceSeconds={0}
        overdueHandling="autoabandon"
        onTimeUp={vi.fn()}
      />,
    );

    advance(1_000_000);
    expect(screen.getByRole('timer').textContent).toBe('00:00');
    expect(screen.getByRole('timer').textContent).not.toContain('-');
  });

  /*
   * Two escalations, and the ORDER of them is the point: a single warning that
   * appears with five minutes left has stopped registering by the time there
   * is one minute left, which is exactly when it matters most.
   */
  it('warns under five minutes, without yet going critical', () => {
    render(
      <QuizTimer
        deadlineAt="2026-01-01T00:04:00.000Z"
        serverTime={SERVER_TIME}
        graceSeconds={60}
        overdueHandling="autosubmit"
        onTimeUp={vi.fn()}
      />,
    );

    const timer = screen.getByRole('timer');
    expect(timer.className).toContain('runner-clock--warn');
    expect(timer.className).not.toContain('runner-clock--critical');
  });

  it('goes critical in the last minute', () => {
    render(
      <QuizTimer
        deadlineAt="2026-01-01T00:00:45.000Z"
        serverTime={SERVER_TIME}
        graceSeconds={60}
        overdueHandling="autosubmit"
        onTimeUp={vi.fn()}
      />,
    );

    const timer = screen.getByRole('timer');
    expect(timer.className).toContain('runner-clock--critical');
    expect(timer.className).not.toContain('runner-clock--warn');
  });

  it('is plain with plenty of time left', () => {
    render(
      <QuizTimer
        deadlineAt="2026-01-01T00:20:00.000Z"
        serverTime={SERVER_TIME}
        graceSeconds={60}
        overdueHandling="autosubmit"
        onTimeUp={vi.fn()}
      />,
    );

    const timer = screen.getByRole('timer');
    expect(timer.className).not.toContain('runner-clock--warn');
    expect(timer.className).not.toContain('runner-clock--critical');
  });

  it('renders nothing for an untimed quiz', () => {
    render(
      <QuizTimer
        deadlineAt={null}
        serverTime={SERVER_TIME}
        graceSeconds={60}
        overdueHandling="autosubmit"
        onTimeUp={vi.fn()}
      />,
    );
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  // I7 regression: `role="timer"` must never carry an author `aria-live`
  // override — its implicit `off` is the whole point. A per-second
  // `aria-live="assertive"` region interrupts a screen reader constantly
  // during the exact window (last 5 minutes) a student most needs to keep
  // reading the question undisturbed.
  describe('screen-reader announcements (I7)', () => {
    it('never sets aria-live on the visible countdown, even deep in the warn window', () => {
      render(
        <QuizTimer
          deadlineAt="2026-01-01T00:04:00.000Z"
          serverTime={SERVER_TIME}
          graceSeconds={60}
          overdueHandling="autosubmit"
          onTimeUp={vi.fn()}
        />,
      );

      const timer = screen.getByRole('timer');
      expect(timer).not.toHaveAttribute('aria-live');

      // Ticking every second all the way down must not make one appear later.
      advance(60_000);
      expect(screen.getByRole('timer')).not.toHaveAttribute('aria-live');
    });

    it('never sets aria-live on the grace-period countdown either', () => {
      render(
        <QuizTimer
          deadlineAt="2026-01-01T00:00:01.000Z"
          serverTime={SERVER_TIME}
          graceSeconds={60}
          overdueHandling="graceperiod"
          onTimeUp={vi.fn()}
        />,
      );

      advance(2_000);
      const timer = screen.getByRole('timer');
      expect(timer.textContent).toContain('ثانية');
      expect(timer).not.toHaveAttribute('aria-live');
    });

    it('announces the 5-minute threshold exactly once, politely, without repeating every second', () => {
      render(
        <QuizTimer
          // 330s: already below the 10-min threshold (fires once on mount),
          // still above the 5-min one.
          deadlineAt="2026-01-01T00:05:30.000Z"
          serverTime={SERVER_TIME}
          graceSeconds={60}
          overdueHandling="autosubmit"
          onTimeUp={vi.fn()}
        />,
      );

      const live = document.querySelector('[aria-live="polite"]') as HTMLElement;
      expect(live).toBeTruthy();
      expect(live.textContent).toBe('باقي 10 دقايق على انتهاء وقت الامتحان');

      // Crosses the 5-minute (300s) threshold.
      advance(30_000);
      expect(live.textContent).toBe('باقي 5 دقايق على انتهاء وقت الامتحان');

      // Keeps ticking for several more seconds — must NOT re-announce or
      // change to anything else (still well above the next threshold).
      advance(10_000);
      expect(live.textContent).toBe('باقي 5 دقايق على انتهاء وقت الامتحان');
    });

    it('announces 10 minutes, then 5 minutes, then 1 minute, then 30 seconds, in order', () => {
      render(
        <QuizTimer
          deadlineAt="2026-01-01T00:10:01.000Z"
          serverTime={SERVER_TIME}
          graceSeconds={60}
          overdueHandling="autosubmit"
          onTimeUp={vi.fn()}
        />,
      );
      const live = document.querySelector('[aria-live="polite"]') as HTMLElement;

      advance(2_000); // -> under 10:00
      expect(live.textContent).toBe('باقي 10 دقايق على انتهاء وقت الامتحان');

      advance(5 * 60_000); // -> under 5:00
      expect(live.textContent).toBe('باقي 5 دقايق على انتهاء وقت الامتحان');

      advance(4 * 60_000); // -> under 1:00
      expect(live.textContent).toBe('باقي دقيقة واحدة على انتهاء وقت الامتحان');

      advance(30_000); // -> under 0:30
      expect(live.textContent).toBe('باقي 30 ثانية على انتهاء وقت الامتحان');
    });
  });
});
