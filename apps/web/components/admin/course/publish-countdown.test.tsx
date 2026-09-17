import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';
import { PublishCountdown } from './publish-countdown';

const c = copy.admin.lesson;
const NOW = new Date('2026-09-13T18:00:00.000Z');

function inMinutes(minutes: number): string {
  return new Date(NOW.getTime() + minutes * 60_000).toISOString();
}

describe('PublishCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  /** The component paints nothing until it has mounted, so every case has to
   *  let the mount effect run before asserting. */
  function show(publishAt: string) {
    render(<PublishCountdown publishAt={publishAt} />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
  }

  it('counts hours and minutes', () => {
    show(inMinutes(4 * 60 + 12));
    expect(screen.getByRole('status').textContent).toBe('فاضل 4 ساعة و12 دقيقة');
  });

  it('drops to minutes under the hour', () => {
    show(inMinutes(25));
    expect(screen.getByRole('status').textContent).toBe('فاضل 25 دقيقة');
  });

  it('says days and hours, never three units', () => {
    // «يوم و٤ ساعات و١٢ دقيقة» is read twice; the minutes are noise at that
    // distance, so they are deliberately dropped.
    show(inMinutes(24 * 60 + 4 * 60 + 12));
    expect(screen.getByRole('status').textContent).toBe('فاضل 1 يوم و4 ساعة');
  });

  it('never rounds down to «فاضل 0 دقيقة»', () => {
    // Thirty seconds out is still the future, and a zero reads as "it is not
    // going to happen".
    show(new Date(NOW.getTime() + 30_000).toISOString());
    expect(screen.getByRole('status').textContent).toBe('فاضل 1 دقيقة');
  });

  it('says the sweeper is about to run just past the moment', () => {
    // The sweeper ticks once a minute, so a few seconds past is normal and
    // must not read as a fault.
    show(new Date(NOW.getTime() - 20_000).toISOString());
    expect(screen.getByRole('status').textContent).toBe(c.publishAtDueNow);
  });

  it('says it did not fire once it is properly overdue', () => {
    show(inMinutes(-30));
    expect(screen.getByRole('status').textContent).toBe(c.publishAtOverdue);
  });

  it('renders nothing for an unparseable date rather than NaN', () => {
    const { container } = render(<PublishCountdown publishAt="not-a-date" />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(container.textContent).toBe('');
  });

  it('ticks without a reload', () => {
    show(inMinutes(90));
    expect(screen.getByRole('status').textContent).toBe('فاضل 1 ساعة و30 دقيقة');
    act(() => {
      vi.advanceTimersByTime(31 * 60_000);
    });
    expect(screen.getByRole('status').textContent).toBe('فاضل 59 دقيقة');
  });
});
