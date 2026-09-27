'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { LiveQueue } from '@ayman/contracts/notifications';
import {
  isStreamConnected,
  onStreamOpen,
  subscribeQueue,
  subscribeStreamConnection,
} from '@/components/notifications/live-bus';

/**
 * The shortest gap between two re-reads of one screen.
 *
 * The API rate-limits per admin session — 10 a second, 60 a minute — and the
 * four sidebar pollers already spend eight of those sixty. A transfer capture
 * approving twenty claims at once publishes twenty frames in a second; this
 * turns them into one read now and one straight after, not twenty. At the
 * worst sustained pace (a frame every gap, all minute) it is 24 reads a
 * minute, well under the ceiling with room for the admin's own clicks.
 */
export const LIVE_MIN_GAP_MS = 2_500;

/**
 * Keeps one admin list in step with its live queue — the mechanism behind
 * «طلب الدفع يظهر لوحده من غير ريفرش».
 *
 * ## Why the existing stream and not a poll of its own
 *
 * The admin already holds ONE Server-Sent Events connection per tab — the
 * bell's (`NotificationStreamProvider`) — with its heartbeat, its
 * anti-buffering headers and its reconnect all proven in production behind
 * Cloudflare and Traefik. The server now also writes a `queue` frame on it
 * whenever the desk moves (`PaymentsService.announceDesk`), so a new claim
 * shows up in the time a Redis PUBLISH takes, and an idle screen costs
 * NOTHING — where a poll fast enough to feel live would be a request every few
 * seconds from every open admin tab, against a 60-a-minute limit, for a list
 * that changes a few times an hour.
 *
 * ## What calls `sync`
 *
 * - a frame for `queue` — someone submitted, approved, rejected, or a
 *   transfer settled a claim with nobody at the keyboard;
 * - the stream (re)opening — frames sent while it was down are gone, and this
 *   is the one gap a frame cannot fill;
 * - the page coming back — the router keeps a page you left mounted (hidden)
 *   and only re-runs its effects when you return, so the rows it shows are
 *   whatever it held when you left;
 * - `request()`, for a caller with its own reason (the badge's poll disagreeing
 *   with the list's own count).
 *
 * ## What keeps it from being a storm
 *
 * Coalesced to one read per `LIVE_MIN_GAP_MS`, one in flight at a time, and
 * NONE while the tab is hidden: a signal then only marks the list stale, and
 * the read happens once, when the tab is looked at again. Everything —
 * listeners, timers, the in-flight request — is torn down with the effect, so
 * a page the router keeps in the background stops listening instead of
 * quietly re-reading behind the admin's back.
 *
 * `sync` must swallow nothing it cannot handle — a rejection here is ignored,
 * which is right for a list (the rows on screen stay; the next signal tries
 * again) and wrong for anything that must not fail silently.
 */
export function useLiveQueue(
  queue: LiveQueue,
  sync: (signal: AbortSignal) => Promise<void>,
): { live: boolean; request: () => void } {
  /*
    The latest-ref pattern, assigned in an effect — the same shape, and the
    same reason, as `NotificationStreamProvider`'s `onEvent`: `sync` closes
    over the page's query, and putting it in the connection effect's
    dependencies would tear down every listener on each render.
  */
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  const requestRef = useRef<() => void>(() => undefined);
  const request = useCallback(() => requestRef.current(), []);

  // Survives the router hiding and re-showing the page (state does), so the
  // effect below can tell a return from a first mount.
  const mountedBefore = useRef(false);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight: AbortController | null = null;
    let stale = false;
    let lastRun = 0;

    const visible = () => document.visibilityState === 'visible';

    const run = () => {
      timer = null;
      if (disposed) return;
      if (!visible() || inFlight !== null) {
        stale = true;
        return;
      }
      stale = false;
      lastRun = Date.now();
      const controller = new AbortController();
      inFlight = controller;
      void syncRef
        .current(controller.signal)
        .catch(() => undefined)
        .finally(() => {
          if (inFlight === controller) inFlight = null;
          // A signal that landed mid-read may describe a change the read
          // already missed — one more, after the gap.
          if (!disposed && stale) schedule();
        });
    };

    const schedule = () => {
      if (disposed) return;
      if (!visible()) {
        stale = true;
        return;
      }
      if (timer !== null) return;
      timer = setTimeout(run, Math.max(0, lastRun + LIVE_MIN_GAP_MS - Date.now()));
    };

    requestRef.current = schedule;
    const offFrame = subscribeQueue(queue, schedule);
    const offOpen = onStreamOpen(schedule);
    const onVisibility = () => {
      if (visible() && stale) schedule();
    };
    document.addEventListener('visibilitychange', onVisibility);

    if (mountedBefore.current) schedule();
    mountedBefore.current = true;

    return () => {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      inFlight?.abort();
      offFrame();
      offOpen();
      document.removeEventListener('visibilitychange', onVisibility);
      requestRef.current = () => undefined;
    };
  }, [queue]);

  const live = useSyncExternalStore(subscribeStreamConnection, isStreamConnected, () => false);
  return { live, request };
}
