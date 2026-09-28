'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { parseAdminWalletTopupsPendingCount } from '@ayman/contracts/admin/wallet-topups-pending-count';
import { apiGetNarrow } from '@/lib/api';
import { onStreamOpen, subscribeQueue } from '@/components/notifications/live-bus';

/**
 * «طلبات الشحن» — the sidebar badge's number, kept live.
 *
 * The same shape as `PaymentsAlertsProvider`, on the wallet's own queue: the
 * `wallet-topups` frame on the tab's one stream carries the pending count, so
 * a request a student sends lights the badge with no request of its own, and a
 * thirty-second poll is the floor under it for when the stream is down.
 *
 * Mounted only for a session holding `payment:read` — see the admin layout —
 * so nobody polls a route that would 403 forever.
 */
const POLL_MS = 30_000;

const CountContext = createContext<number | null>(null);
const RefreshContext = createContext<() => void>(() => undefined);

export function useWalletTopupsPendingCount(): number | null {
  return useContext(CountContext);
}

/** For the approve/reject buttons: the badge drops the moment the admin
 *  decides, not on the next poll. */
export function useRefreshWalletTopupsPendingCount(): () => void {
  return useContext(RefreshContext);
}

export function WalletTopupsAlertsProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState<number | null>(null);

  const refresh = useCallback(() => {
    void apiGetNarrow('/api/admin/wallet-topups?status=pending&perPage=10', parseAdminWalletTopupsPendingCount)
      .then(setCount)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    refresh();
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);

    const offFrame = subscribeQueue('wallet-topups', setCount);
    // A reconnect may have missed frames — re-read once it is back.
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
    <RefreshContext.Provider value={refresh}>
      <CountContext.Provider value={count}>{children}</CountContext.Provider>
    </RefreshContext.Provider>
  );
}
