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

  it('uses the warn token, never the error token, once under five minutes', () => {
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
    expect(timer.className).toContain('text-warn');
    expect(timer.className).not.toContain('text-err');
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
});
