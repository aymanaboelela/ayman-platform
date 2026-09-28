'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
// The dedicated leaf module, never `@ayman/contracts/admin/payments` — see
// its own header note: this provider is mounted on every admin page (from
// the layout, beside `InboxAlertsProvider`), and importing the full payments
// contract module for one integer would drag its row schema onto every
// screen for a badge nobody but this poll reads.
import { parseAdminPaymentsPendingCount } from '@ayman/contracts/admin/payments-pending-count';
import { apiGetNarrow } from '@/lib/api';
import { onStreamOpen, subscribeQueue } from '@/components/notifications/live-bus';

/** Same cadence as `InboxAlertsProvider` — one poll while the tab is in
 *  front, paused while it is hidden. */
const POLL_MS = 30_000;

const PaymentsPendingCountContext = createContext<number | null>(null);

/**
 * Re-read the count NOW, without waiting for the next tick.
 *
 * Separate from the count context on purpose: the value here is stable for the
 * life of the provider, so a component that only re-reads (the review buttons)
 * does not re-render every time the number changes, and a component that only
 * displays (the sidebar badge) does not re-render when this identity would
 * otherwise change. One context carrying `{count, refresh}` would give both
 * components both re-renders.
 */
const PaymentsRefreshContext = createContext<() => void>(() => undefined);

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
 * For the screen that CHANGES the number — «وافق» / «ارفض» on
 * `/admin/payments`.
 *
 * Without it the badge kept the old count for up to a full poll interval after
 * a review: approve the last pending claim and the sidebar still says «1» for
 * thirty seconds. «لما أوافق أو أرفض يبقى الرقم ده خلاص يتشال على طول.» The
 * poll is the floor, not the mechanism — an admin who just acted should not be
 * told about their own action on a timer.
 *
 * Safe to call from a page mounted outside the provider (it defaults to a
 * no-op): the layout mounts `PaymentsAlertsProvider` only for sessions holding
 * `payment:read`, and a session without it has no badge to correct.
 */
export function useRefreshPaymentsPendingCount(): () => void {
  return useContext(PaymentsRefreshContext);
}

/**
 * The sidebar's payments badge — «كام طلب قيد المراجعة دلوقتي» at a glance,
 * asked for by name.
 *
 * A poll against the SAME list endpoint the review screen itself reads
 * (`?status=pending&perPage=10` — the smallest page size `ListQuerySchema`
 * allows; `rowCount` does not depend on it), not a dedicated count route: the
 * query already runs `count()` alongside the page of rows inside one
 * `$transaction` (`PaymentsService.adminList`), so this costs nothing beyond
 * what the review screen already pays, and there is no second endpoint to
 * keep in sync with the first if the definition of "pending" ever changes.
 *
 * No toast and no OS notification here, unlike `InboxAlertsProvider` — a
 * payment claim sitting in the queue is not a message someone is waiting on
 * an answer to arrive; the badge itself is the whole ask.
 *
 * ## Live, with the poll as the floor
 *
 * The number mostly arrives on the live stream now: every write that changes
 * the queue publishes a `payments` queue frame carrying the pending count
 * (`PaymentsService.announceDesk`), and this sets it straight from the frame
 * — no request at all. A claim approved by ANOTHER admin, or by a transfer
 * with nobody at the keyboard, leaves the badge the moment it happens instead
 * of up to thirty seconds later.
 *
 * The poll stays, unchanged, because the stream can be quietly unable to
 * deliver (Redis down, a proxy holding a dead socket until the watchdog
 * notices) and still look connected. It is what makes "live" degrade to
 * "thirty seconds late" rather than to "wrong until reload".
 */
export function PaymentsAlertsProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState<number | null>(null);

  const refresh = useCallback(() => {
    // `perPage=10`, not `1` — `ListQuerySchema.perPage` only accepts
    // `PAGE_SIZES` (10/20/50/100); `1` fails that `.refine` and the API
    // answers every poll with 400, silently (the `.catch` below swallows
    // it), so the badge never shows a count. `rowCount` is the same integer
    // regardless of page size — see `parseAdminPaymentsPendingCount`.
    void apiGetNarrow(
      '/api/admin/payments/submissions?status=pending&perPage=10',
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

    // The frame IS the answer — absolute, like the poll's — so the badge moves
    // even in a hidden tab, and without a request.
    const offFrame = subscribeQueue('payments', setCount);
    // A reconnect means frames were lost while it was down. The mount read
    // above covers the stream's FIRST open, so only a later one re-reads.
    let opens = 0;
    const offOpen = onStreamOpen(() => {
      opens += 1;
      if (opens > 1) tick();
    });

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      offFrame();
      offOpen();
    };
  }, [refresh]);

  return (
    <PaymentsRefreshContext.Provider value={refresh}>
      <PaymentsPendingCountContext.Provider value={count}>
        {children}
      </PaymentsPendingCountContext.Provider>
    </PaymentsRefreshContext.Provider>
  );
}
