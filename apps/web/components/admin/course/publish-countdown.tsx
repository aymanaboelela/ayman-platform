'use client';

import { useSyncExternalStore } from 'react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';

const c = copy.admin.lesson;

/**
 * A minute-resolution clock, shared by every countdown on the screen.
 *
 * `useSyncExternalStore` rather than `useEffect` + `setState` — the same
 * reasoning as `admin/exams/window-echo.tsx`, and the same rule
 * (`react-hooks/set-state-in-effect`) enforcing it: an effect that immediately
 * re-renders is a commit the reader can sometimes see.
 *
 * The snapshot has to be CACHED — a `getSnapshot` that returned `Date.now()`
 * fresh on every call would differ on every render and React would loop. So the
 * value only moves when the interval moves it.
 *
 * A 30-second tick for a value shown to the minute: on a 60-second tick the
 * reading can sit a whole minute stale, and «فاضل ساعة» that stays put while
 * the wall clock moves is exactly what makes someone reload the page to check
 * the feature still works.
 */
const TICK_MS = 30_000;

let clock = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribeClock(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    // Set on the way in, not at module load: by the time a second countdown
    // mounts on a long-lived tab, a module-load timestamp would be hours old.
    clock = Date.now();
    timer = setInterval(() => {
      clock = Date.now();
      for (const notify of [...listeners]) notify();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function readClock(): number {
  return clock;
}

/** The server has no business having an opinion about the reader's clock. */
function getServerClock(): number {
  return 0;
}

/**
 * «فاضل كام ساعة وتتنشر» — the schedule, said as a duration.
 *
 * ## Why a date is not enough
 *
 * `٢٠٢٦-٠٩-١٣ ٢٠:٠٠` is a fact the reader has to do arithmetic on, at exactly
 * the moment they are least inclined to: late at night, checking whether the
 * lecture they just scheduled is really going out. «فاضل ٤ ساعات و١٢ دقيقة» is
 * the same fact already answered. The date stays right beside it — the duration
 * is for reassurance, the date is for correcting a mistake.
 *
 * ## Two traps, both avoided by rendering nothing until hydration
 *
 *   · a duration computed during SSR is computed in the SERVER's clock and then
 *     hydrated against the browser's. The two disagree by however long the
 *     response took, and React reports it as a hydration mismatch;
 *   · the server is in UTC and the instructor is in Cairo. Any wall-clock
 *     phrasing rendered server-side is three hours out.
 *
 * The cost is one frame with no countdown, on an admin panel, which nobody will
 * ever catch.
 */
export function PublishCountdown({ publishAt }: { publishAt: string }) {
  const now = useSyncExternalStore(subscribeClock, readClock, getServerClock);

  // Zero is the pre-subscription sentinel — server render and the hydrating
  // client render both land here. React re-reads the snapshot the moment the
  // subscription is live, so the real value follows in the same commit phase.
  if (now === 0) return null;

  const target = new Date(publishAt).getTime();
  if (Number.isNaN(target)) return null;

  const remaining = target - now;

  /*
   * Past its moment and still a draft: the sweeper runs once a minute, so a few
   * seconds here are entirely normal and the copy says so rather than implying
   * something is stuck. Past that, the honest reading is that the schedule did
   * not fire — and an instructor staring at a lecture that should be live needs
   * to be told, not reassured.
   */
  if (remaining <= 0) {
    return (
      <span className="text-accent-text" role="status">
        {remaining > -120_000 ? c.publishAtDueNow : c.publishAtOverdue}
      </span>
    );
  }

  const minutes = Math.floor(remaining / 60_000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const restMinutes = minutes % 60;

  /*
   * The largest unit that is true, plus the one under it — never three. «يوم و٤
   * ساعات» is read at a glance; «يوم و٤ ساعات و١٢ دقيقة» is read twice, and the
   * minutes are noise at that distance.
   *
   * The floor to one minute matters: thirty seconds out is still the future,
   * and «فاضل ٠ دقيقة» reads as "it is not going to happen".
   */
  const text =
    days > 0
      ? formatCopy(c.publishAtInDays, { days, hours })
      : hours > 0
        ? formatCopy(c.publishAtInHours, { hours, minutes: restMinutes })
        : formatCopy(c.publishAtInMinutes, { minutes: Math.max(restMinutes, 1) });

  return (
    <span className="font-medium text-accent-text tabular-nums" role="status">
      {text}
    </span>
  );
}
