'use client';

import { useEffect } from 'react';
import { usePaymentsPendingCount } from './payments-alerts';
import { useWalletTopupsPendingCount } from './wallet-topups-alerts';
import { useBookOrdersUnshippedCount } from './book-orders-alerts';
import { useHomeworkPendingCount } from './homework-alerts';

/**
 * The number on the home-screen icon, while the admin app is open.
 *
 * It reads the four sidebar badges rather than polling anything of its own:
 * they already poll, already refresh the moment a row is approved, and the
 * icon saying 3 while the sidebar says 2 is the one thing this must never do.
 * With the app closed, `sw.js` corrects the icon on each admin push from
 * `GET /api/admin/mobile/pending`, which counts the same four queues.
 *
 * A badge whose provider is not mounted (no permission, or the feature is off
 * on this stack) reads `null` and counts as nothing. Until at least one has
 * loaded, the icon is left alone — the worker's last number is better than a
 * zero drawn before anything was fetched.
 *
 * Renders nothing; mounted by the admin layout only where `adminMobile` is on.
 */
export function AppBadge() {
  const counts = [
    usePaymentsPendingCount(),
    useWalletTopupsPendingCount(),
    useBookOrdersUnshippedCount(),
    useHomeworkPendingCount(),
  ];
  const loaded = counts.some((count) => count !== null);
  const total = counts.reduce<number>((sum, count) => sum + (count ?? 0), 0);

  useEffect(() => {
    if (!loaded || !('setAppBadge' in navigator)) return;
    // Rejects outside an installed app on some browsers — not an error here.
    (total > 0 ? navigator.setAppBadge(total) : navigator.clearAppBadge()).catch(() => undefined);
  }, [loaded, total]);

  return null;
}
