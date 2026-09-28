'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy';

/**
 * The ceiling on how long a route skeleton may stay on screen.
 *
 * Mounted inside every `loading.tsx` (`lib/loading-coverage.test.ts` enforces
 * it), so it lives exactly as long as the skeleton does: the moment the page
 * arrives, Next swaps the fallback out, this unmounts, and nothing happens.
 * It only ever acts on a skeleton that has outlived any honest load.
 *
 * ## Why a skeleton needs a ceiling at all
 *
 * «بضغط على حاجة تقعد تحمّل على طول، ولما أعمل refresh بتفتح بسرعة». A
 * `loading.tsx` is a Suspense fallback, and a Suspense fallback has no
 * timeout: whatever it is waiting for, it waits for forever. Everything the
 * SERVER waits on is already bounded (`SERVER_TIMEOUT_MS` in `lib/api.ts`,
 * three seconds in `proxy.ts`), so a slow API ends in `error.tsx`, not here.
 * What is not bounded is the browser's side of it:
 *
 *   · a chunk whose `<script>` failed once — `CHUNK_SCRIPT_RESCUE` in
 *     `lib/security/prepaint-script.ts` is the real fix for that one, and
 *     this is the net under it;
 *   · a request that stalls without failing — a phone between towers, or a
 *     deploy's container swap caught mid-response. Measured locally with a
 *     socket that accepts and never answers: the dashboard skeleton stayed up
 *     for as long as the socket stayed open, with no error anywhere;
 *   · the router's own hard-navigation fallback, which sends the tab to
 *     `location.assign()` and then suspends the whole app on a promise that
 *     never resolves — by design — until the page unloads. A navigation that
 *     never completes leaves the skeleton up with nothing left to retry it.
 *
 * None of those is visible from here, and none needs to be. A document load
 * is what the student was already doing to escape every one of them, so the
 * guard does the same thing, only sooner and without being asked.
 *
 * ## The two numbers
 *
 * `HINT_AFTER_MS`: long enough that a real load on slow mobile data never
 * sees it; after it, the student is told the page is slow and handed the
 * reload themselves, rather than left to guess whether anything is happening.
 *
 * `RELOAD_AFTER_MS`: ABOVE every server-side ceiling (15 s for the page's own
 * reads, 3 s for the proxy's session check), so it never races a render that
 * is about to end in `error.tsx` on its own. A skeleton still up after this
 * is waiting on something that is not coming.
 *
 * Counted in VISIBLE time only: a tab in the background has its timers
 * throttled and its network deprioritised, and reloading a page nobody is
 * looking at would spend the one automatic attempt where it helps no one.
 */
export const HINT_AFTER_MS = 8_000;
export const RELOAD_AFTER_MS = 20_000;

const TICK_MS = 1_000;
const TOAST_ID = 'route-loading-slow';

/**
 * ⚠️ ONCE per path per few minutes, and the bound is the whole safety of it.
 *
 * If the reload lands on the same stuck skeleton, reloading again cannot be
 * the answer — the cause is not in this tab — and a page that reloads itself
 * every twenty seconds is worse than one that waits. So the path and the time
 * are written BEFORE reloading, and a second arrival within the window keeps
 * the toast (the student can still press it) and stops there.
 *
 * A window rather than a permanent mark, for the reason `useErrorRetry`'s
 * chunk mark carries the build: a permanent mark spends the tab's recovery on
 * the first stall ever, and a genuine one an hour later would get nothing.
 *
 * `sessionStorage` because the reload discards everything else, and per TAB
 * because two tabs are two separate stalls. Failing CLOSED: a reload we cannot
 * record is a reload we cannot bound, so a store that throws (Safari private
 * mode) means no automatic reload at all — the toast still offers one.
 */
const RELOAD_MARK = 'ayman:stuck-route-reload';
const RELOAD_WINDOW_MS = 5 * 60_000;

function reloadOnce(): void {
  const path = window.location.pathname;
  const now = Date.now();
  try {
    const raw = window.sessionStorage.getItem(RELOAD_MARK);
    if (raw) {
      const last = JSON.parse(raw) as { path?: unknown; at?: unknown };
      if (last.path === path && typeof last.at === 'number' && now - last.at < RELOAD_WINDOW_MS) {
        return;
      }
    }
    window.sessionStorage.setItem(RELOAD_MARK, JSON.stringify({ path, at: now }));
  } catch {
    return;
  }
  window.location.reload();
}

export function RouteLoadingWatchdog() {
  useEffect(() => {
    let visibleMs = 0;
    let last = Date.now();
    let hinted = false;
    let fired = false;

    const timer = window.setInterval(() => {
      const now = Date.now();
      // Capped, so the minute a throttled background timer can take to fire
      // is not counted as a minute of someone staring at the skeleton.
      const elapsed = Math.min(now - last, TICK_MS * 2);
      last = now;
      if (document.visibilityState !== 'visible') return;
      visibleMs += elapsed;

      if (!hinted && visibleMs >= HINT_AFTER_MS) {
        hinted = true;
        toast(copy.common.slowLoad, {
          id: TOAST_ID,
          duration: Infinity,
          action: {
            label: copy.common.slowLoadReload,
            onClick: () => window.location.reload(),
          },
        });
      }

      if (!fired && visibleMs >= RELOAD_AFTER_MS) {
        fired = true;
        reloadOnce();
      }
    }, TICK_MS);

    return () => {
      window.clearInterval(timer);
      // The page arrived (or the student left): the toast is about a wait
      // that is over, and must not outlive it.
      if (hinted) toast.dismiss(TOAST_ID);
    };
  }, []);

  return null;
}
