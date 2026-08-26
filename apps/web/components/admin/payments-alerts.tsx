'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
// The dedicated leaf module, never `@ayman/contracts/admin/payments` — see
// its own header note: this provider is mounted on every admin page (from
// the layout, beside `InboxAlertsProvider`), and importing the full payments
// contract module for one integer would drag its row schema onto every
// screen for a badge nobody but this poll reads.
import { parseAdminPaymentsPendingCount } from '@ayman/contracts/admin/payments-pending-count';
import { apiGetNarrow } from '@/lib/api';

/** Same cadence as `InboxAlertsProvider` — one poll while the tab is in
 *  front, paused while it is hidden. */
const POLL_MS = 30_000;

const PaymentsPendingCountContext = createContext<number | null>(null);

/**
 * How many Vodafone Cash submissions are sitting in `pending`, or `null`
 * before the first answer lands (and on every session without `payment:read`
 * — see the layout, which mounts this provider only when the permission is
 * held).
 */
export function usePaymentsPendingCount(): number | null {
  return useContext(PaymentsPendingCountContext);
}

/**
 * The sidebar's payments badge — «كام طلب قيد المراجعة دلوقتي» at a glance,
 * asked for by name.
 *
 * A poll against the SAME list endpoint the review screen itself reads
 * (`?status=pending&perPage=1`), not a dedicated count route: the query
 * already runs `count()` alongside the page of rows inside one
 * `$transaction` (`PaymentsService.adminList`), so asking for one row costs
 * nothing beyond what the review screen already pays, and there is no second
 * endpoint to keep in sync with the first if the definition of "pending"
 * ever changes.
 *
 * No toast and no OS notification here, unlike `InboxAlertsProvider` — a
 * payment claim sitting in the queue is not a message someone is waiting on
 * an answer to arrive; the badge itself is the whole ask.
 */
export function PaymentsAlertsProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState<number | null>(null);

  const refresh = useCallback(() => {
    void apiGetNarrow(
      '/api/admin/payments/submissions?status=pending&perPage=1',
      parseAdminPaymentsPendingCount,
    )
      .then(setCount)
      // Swallowed on purpose, same as the inbox poll: a badge that cannot be
      // refreshed must not throw over whatever the admin is doing elsewhere
      // on the page. The next tick tries again.
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
    <PaymentsPendingCountContext.Provider value={count}>
      {children}
    </PaymentsPendingCountContext.Provider>
  );
}
