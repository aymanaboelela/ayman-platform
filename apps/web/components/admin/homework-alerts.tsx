'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
// The dedicated leaf module, never `@ayman/contracts/homework` — see its own
// header note: this provider is mounted on every admin page, and importing the
// full contract for one integer would drag its row, detail and review schemas
// onto every screen for a badge nobody but this poll reads.
import { parseAdminHomeworkPendingCount } from '@ayman/contracts/admin/homework-pending-count';
import { apiGetNarrow } from '@/lib/api';

/** Same cadence as the inbox, payments and book-order polls. */
const POLL_MS = 30_000;

const HomeworkPendingCountContext = createContext<number | null>(null);

/** Re-read NOW — for the review form, which removes a row from this count the
 *  moment it is submitted. Its own context, for the reason
 *  `payments-alerts.tsx` documents: displayers and refreshers must not
 *  re-render each other. */
const HomeworkRefreshContext = createContext<() => void>(() => undefined);

/**
 * How many homework answers are waiting on a decision, or `null` before the
 * first poll answers (and on every session without `homework:read` — the
 * layout mounts this provider only when the permission is held).
 *
 * `null` and `0` are deliberately different: `0` means "asked, nothing
 * waiting", `null` means "not asked yet". Neither draws a badge, but only one
 * of them is an answer.
 */
export function useHomeworkPendingCount(): number | null {
  return useContext(HomeworkPendingCountContext);
}

export function useRefreshHomeworkPendingCount(): () => void {
  return useContext(HomeworkRefreshContext);
}

/**
 * The sidebar's «الواجبات» badge.
 *
 * Its own endpoint rather than the list's `rowCount` — unlike the book-orders
 * badge, which reuses a list call the screen already makes. The homework list
 * is filtered and paginated and its default filter can be changed from the
 * screen; a badge reading `rowCount` off whatever query the sidebar happened to
 * send would quietly start counting something else the day that default moves.
 * `pending-count` is one `count()` with the definition in the name.
 */
export function HomeworkAlertsProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState<number | null>(null);

  const refresh = useCallback(() => {
    void apiGetNarrow('/api/admin/homework/pending-count', parseAdminHomeworkPendingCount)
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
    <HomeworkRefreshContext.Provider value={refresh}>
      <HomeworkPendingCountContext.Provider value={count}>
        {children}
      </HomeworkPendingCountContext.Provider>
    </HomeworkRefreshContext.Provider>
  );
}
