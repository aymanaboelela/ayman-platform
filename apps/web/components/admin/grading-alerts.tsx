'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
// The dedicated leaf module, never `@ayman/contracts/admin/exams` — see its
// own header note: this provider is mounted on every admin page, and importing
// the exam contract for one integer would drag every exam and grading schema
// onto every screen for a badge nobody but this poll reads.
import { parseAdminGradingPendingCount } from '@ayman/contracts/admin/grading-pending-count';
import { apiGetNarrow } from '@/lib/api';

/** Same cadence as the inbox, payments, book-order and homework polls. */
const POLL_MS = 30_000;

const GradingPendingCountContext = createContext<number | null>(null);

/** Re-read NOW — for the marking screen, which can empty a paper the moment an
 *  answer is saved. Its own context, for the reason `payments-alerts.tsx`
 *  documents: displayers and refreshers must not re-render each other. */
const GradingRefreshContext = createContext<() => void>(() => undefined);

/**
 * How many papers are waiting on a human mark, or `null` before the first
 * poll answers (and on every session without `attempt:grade` — the layout
 * mounts this provider only when the permission is held).
 */
export function useGradingPendingCount(): number | null {
  return useContext(GradingPendingCountContext);
}

export function useRefreshGradingPendingCount(): () => void {
  return useContext(GradingRefreshContext);
}

/**
 * The sidebar's «تصحيح الورق» badge.
 *
 * Its own count route, like «الواجبات», and for a sharper version of the same
 * reason: the only list that could have been reused is `grading-queue`, which
 * carries every waiting paper's student name and lesson title. The count
 * route runs the queue's own `where` (`PENDING_GRADING_WHERE`), so the badge
 * and the «محتاج تصحيح» tab are one number by construction, not by habit.
 *
 * ⚠️ No `features.exams` gate in the layout, on purpose — the same reasoning
 * as the nav row: this queue holds essays from lesson quizzes and course
 * finals too, and an unmarked essay is a zero on the student's total.
 */
export function GradingAlertsProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState<number | null>(null);

  const refresh = useCallback(() => {
    void apiGetNarrow('/api/admin/grading-queue/count', parseAdminGradingPendingCount)
      .then(setCount)
      // Swallowed on purpose, same as the sibling polls: a badge that cannot be
      // refreshed must not throw over whatever the admin is doing elsewhere on
      // the page. The next tick tries again.
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    refresh();
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);

  return (
    <GradingRefreshContext.Provider value={refresh}>
      <GradingPendingCountContext.Provider value={count}>
        {children}
      </GradingPendingCountContext.Provider>
    </GradingRefreshContext.Provider>
  );
}
