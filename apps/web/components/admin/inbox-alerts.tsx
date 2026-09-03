'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { BellOff, BellRing } from 'lucide-react';
import { toast } from 'sonner';
// The `/copy` SUBPATH, never the root barrel: this component is mounted by the
// admin layout, so a barrel import here would register the whole contracts
// module set as a client reference on every admin route. `client-barrel.test.ts`
// fails the build for it, and the measurement in that file is why.
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { parseAdminUnreadCount } from '@ayman/contracts/assistant/summary';
import { apiGetNarrow } from '@/lib/api';

const c = copy.assistant.inbox;

/** How often the count is re-read while the tab is in front. */
const POLL_MS = 30_000;

const InboxCountContext = createContext<number | null>(null);

/** Nothing to subscribe to — the value below never changes after mount. */
function subscribeNever(): () => void {
  return () => {};
}

/**
 * How many threads are waiting for a reply, or `null` before the first answer
 * lands (and on every screen where the provider is not mounted — a session
 * without `conversation:read` has no inbox to count).
 *
 * `null` and `0` are deliberately different: `0` means "asked, nothing
 * waiting" and must render no badge; `null` means "not asked yet" and must
 * render no badge EITHER, but must not be reported as an answer.
 */
export function useInboxCount(): number | null {
  return useContext(InboxCountContext);
}

/**
 * The instructor's side of «رسالة جديدة».
 *
 * ## What this is, and what it is not
 *
 * It is a poll, running while an admin tab is open, that keeps the sidebar
 * badge honest and raises an OS notification when the number goes UP. It is
 * NOT, on its own, what reaches him with no tab open at all — that leg is Web
 * Push, and it does not live here: `InboxAlertsToggle` below is what turns it
 * on (the same click that requests OS permission also subscribes this
 * browser), the actual sends happen from `NotificationsService.announce` for
 * `assistant_question_received`, and delivery on a closed tab is `sw.js`'s
 * `push` handler, not this poll.
 *
 * ## Why polling, and why 30 seconds
 *
 * The alternative is SSE or a socket, which is a connection held open per admin
 * tab for a screen that changes a few times a day. The app-wide throttle allows
 * 60 requests a minute per tracker, so a 30s poll spends 2 of them and pauses
 * entirely while the tab is hidden — `visibilitychange` refetches immediately
 * on return, so coming back to the tab is the fast path rather than a wait for
 * the next tick.
 *
 * ## Why the first count never notifies
 *
 * `previous` starts as `null` and the alert only fires on a rise from a KNOWN
 * number. Without that, every full page load of every admin screen would
 * announce every thread already sitting in the inbox as new.
 */
export function InboxAlertsProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState<number | null>(null);
  const previous = useRef<number | null>(null);

  /**
   * What to do with a count that has just arrived.
   *
   * Split from the fetch below so that the state lands in a `.then` callback
   * rather than in the effect body — `react-hooks/set-state-in-effect` rejects
   * the synchronous shape, and it is right to: an effect that re-renders on
   * commit is a frame the admin can sometimes see. `assistant-widget.tsx`'s
   * mount probe is the same arrangement for the same reason.
   */
  const apply = useCallback((next: number) => {
    const before = previous.current;
    previous.current = next;
    setCount(next);

    if (before === null || next <= before) return;

    const arrived = next - before;
    const body =
      arrived === 1 ? c.alertBodyOne : formatCopy(c.alertBodyMany, { n: arrived });

    toast(c.alertTitle, {
      description: body,
      action: { label: c.alertOpen, onClick: () => window.location.assign('/admin/inbox') },
    });

    /*
     * The OS notification, when he has granted it. This is the half that
     * reaches him while the tab is in the background — a toast in a tab nobody
     * is looking at is not a notification.
     *
     * `tag` collapses repeats: three messages in ninety seconds replace one
     * another in the tray instead of stacking three times.
     */
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(c.alertTitle, { body, tag: 'ayman-inbox', lang: 'ar', dir: 'rtl' });
    }
  }, []);

  const refresh = useCallback(() => {
    void apiGetNarrow('/api/admin/conversations/unread-count', parseAdminUnreadCount)
      .then(apply)
      /*
       * Swallowed on purpose. This runs on every admin screen, and a badge that
       * cannot be refreshed — an expired session, a restarting API, a throttled
       * minute — must not throw an error toast over whatever the admin is
       * actually doing. The count stops moving and the next tick tries again.
       */
      .catch(() => undefined);
  }, [apply]);

  useEffect(() => {
    const tick = () => {
      // Hidden tabs are skipped rather than merely throttled by the browser:
      // an admin with the dashboard parked in a background window for a week
      // should not be spending a request every thirty seconds for it.
      if (document.visibilityState === 'visible') refresh();
    };

    refresh();
    const timer = window.setInterval(tick, POLL_MS);

    // Coming back to the tab is the moment the number is most likely to be
    // stale AND most likely to be looked at.
    document.addEventListener('visibilitychange', tick);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);

  return <InboxCountContext.Provider value={count}>{children}</InboxCountContext.Provider>;
}

/**
 * The topbar control that asks the browser for permission to raise the OS
 * notification above.
 *
 * ## Why there is a button at all
 *
 * `Notification.requestPermission()` may only be called from a user gesture —
 * Chrome and Firefox both reject a prompt fired on page load, and Chrome
 * remembers the site as one that asks unprompted. So the ask has to be
 * attached to something he clicks, once.
 *
 * ## Why it disappears once granted
 *
 * A permanently-lit bell that does nothing when clicked is chrome. Granted is
 * the steady state and needs no control; `denied` keeps one, because that is
 * the state with something to explain — the browser will not re-prompt, and
 * the only fix is in the site settings the tooltip points at.
 */
export function InboxAlertsToggle() {
  /*
   * Hydration-safe, WITHOUT an effect that immediately re-renders.
   *
   * `Notification` does not exist on the server, and is also absent in the
   * browser on an insecure origin — so the server snapshot is `false` and the
   * client's is `true`, and the permission is only read once the second one is
   * in force. `useEffect` + `setState` would do the same job and is what
   * `react-hooks/set-state-in-effect` rejects; `assistant-widget.tsx` carries
   * the same `subscribeNever` store for the same reason.
   */
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  // Set ONLY by the click below, never by an effect. `null` means "whatever
  // the browser currently says", which is the right answer until he answers
  // the prompt.
  const [answered, setAnswered] = useState<NotificationPermission | null>(null);

  const permission =
    answered ?? (hydrated && typeof Notification !== 'undefined' ? Notification.permission : null);

  if (permission === null || permission === 'granted') return null;

  const blocked = permission === 'denied';

  return (
    <button
      type="button"
      disabled={blocked}
      title={blocked ? c.alertsBlocked : c.alertsEnable}
      aria-label={blocked ? c.alertsBlocked : c.alertsEnable}
      onClick={() => {
        void Notification.requestPermission().then((result) => {
          setAnswered(result);
          /*
           * Web Push, chained onto the SAME click — `PushManager.subscribe`
           * is not gated on a user gesture the way `requestPermission` is,
           * but there is no earlier moment that makes sense to ask: this is
           * the one click where he has just said yes to being interrupted.
           *
           * `await import`, not a static import — same rule
           * `notification-stream.tsx` documents at the top of this file's
           * own module comment: `push-subscribe.ts` reaches
           * `PushPublicKeySchema`, a real Zod schema, and this component
           * mounts on every admin route. A top-level import would put the
           * 62 KB gzip of Zod in the bundle of every one of them for a
           * function that runs on one click, ever.
           */
          if (result === 'granted') {
            void import('@/lib/push-subscribe').then(({ subscribeToPush }) => subscribeToPush());
          }
        });
      }}
      className="flex size-9 items-center justify-center rounded-md text-fg-muted transition-colors duration-[160ms] hover:bg-surface-3 hover:text-fg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
    >
      {blocked ? (
        <BellOff className="size-5" aria-hidden="true" />
      ) : (
        <BellRing className="size-5" aria-hidden="true" />
      )}
    </button>
  );
}
