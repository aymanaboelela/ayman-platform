'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
// The dedicated leaf module, never `@ayman/contracts/admin/book-orders` — see
// its own header note: this provider is mounted on every admin page, and
// importing the full contract for one integer would drag its row schema onto
// every screen for a badge nobody but this poll reads.
import { parseAdminBookOrdersUnshippedCount } from '@ayman/contracts/admin/book-orders-unshipped-count';
import { apiGetNarrow } from '@/lib/api';

/** Same cadence as the payments and inbox polls — one poll while the tab is in
 *  front, paused while it is hidden. */
const POLL_MS = 30_000;

const BookOrdersUnshippedCountContext = createContext<number | null>(null);

/** Re-read NOW. Separate context from the count for the reason
 *  `payments-alerts.tsx` documents: displayers and refreshers should not
 *  re-render each other. */
const BookOrdersRefreshContext = createContext<() => void>(() => undefined);

/**
 * How many paid book orders are waiting to be shipped, or `null` before the
 * first answer lands (and on every session without `book-order:read` — see the
 * layout, which mounts this provider only when the permission is held).
 */
export function useBookOrdersUnshippedCount(): number | null {
  return useContext(BookOrdersUnshippedCountContext);
}

/**
 * For «اتشحن», the one control that removes a row from this count.
 *
 * The poll is the floor, not the mechanism: an admin who just marked the last
 * parcel shipped should not keep seeing «1» on the sidebar for another half
 * minute. «لغاية ما تضغط اتشحنت … فيتشال الرقم.»
 */
export function useRefreshBookOrdersUnshippedCount(): () => void {
  return useContext(BookOrdersRefreshContext);
}

/**
 * The sidebar's «الكتب» badge — how many parcels are owed to somebody right
 * now.
 *
 * A poll against the SAME list endpoint the orders screen itself reads
 * (`?status=paid&perPage=10`), not a dedicated count route: `adminList` already
 * runs its `count()` alongside the page of rows, so this costs nothing beyond
 * what that screen pays, and there is no second endpoint to keep in step if the
 * definition of "owed" ever changes.
 *
 * `paid` and not `paid`+`address_only`: an order that was never paid for is not
 * a parcel anybody is waiting on, and counting it would put a number on the
 * sidebar that no action of Ayman's can clear.
 */
export function BookOrdersAlertsProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState<number | null>(null);

  const refresh = useCallback(() => {
    void apiGetNarrow(
      '/api/admin/book-orders?status=paid&perPage=10',
      parseAdminBookOrdersUnshippedCount,
    )
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
    <BookOrdersRefreshContext.Provider value={refresh}>
      <BookOrdersUnshippedCountContext.Provider value={count}>
        {children}
      </BookOrdersUnshippedCountContext.Provider>
    </BookOrdersRefreshContext.Provider>
  );
}
