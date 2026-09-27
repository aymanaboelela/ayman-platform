'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
// The `/copy` SUBPATH and the `/notifications` leaf, never the root barrel:
// this provider is mounted by both shells, so a barrel import here would
// register the whole contracts module set as a client reference on every
// signed-in page. `client-barrel.test.ts` fails the build for it.
import { copy } from '@ayman/contracts/copy';
import { describeNotification } from '@/lib/notification-view';
import { emitQueueFrame, emitStreamDown, emitStreamOpen } from './live-bus';

const c = copy.notifications;

/**
 * How long a stream may go without a single frame before it is presumed dead.
 *
 * The server writes a heartbeat every 25 seconds (`HEARTBEAT_MS` in
 * `notifications.controller.ts`), so three missed in a row is not a quiet
 * minute — it is a connection the browser still believes is open and nothing
 * will ever arrive on: a laptop that slept, a phone radio that changed
 * networks, a proxy that dropped the upstream without closing the socket.
 * `EventSource` has no timeout of its own and would sit there forever, and
 * every live screen on top of it would sit there too, believing it.
 */
const SILENCE_MS = 75_000;
const WATCHDOG_MS = 30_000;

/** The unread count as the stream last reported it, or `null` when nothing has
 *  arrived yet — in which case the server-rendered number is still the truth. */
const LiveUnreadContext = createContext<number | null>(null);

export function useLiveUnread(): number | null {
  return useContext(LiveUnreadContext);
}

/**
 * The live half of the notification system: one `EventSource` per open tab.
 *
 * ## What it is for
 *
 * «لما أقبل الاشتراك أو أرفضه يتبعتله على طول» — the student is sitting on the
 * subscribe page waiting, and the decision has to reach that page without them
 * refreshing it. And the other direction: a payment or a book order arriving
 * has to reach whoever reviews them, on whatever admin screen they are on.
 *
 * Before this, both sides learned about it from a poll — thirty seconds at
 * best, a page load at worst.
 *
 * ## Why `EventSource` and not a WebSocket
 *
 * The traffic is one-directional and the browser's own reconnect-with-backoff
 * is free. See the endpoint's own note (`notifications.controller.ts`) for the
 * rest of the argument; the short version is that SSE is plain HTTP, so it
 * carries the session cookie and passes the same guard as every other route
 * with nothing new to authenticate.
 *
 * ## Three things happen per event, and they are not the same thing
 *
 * 1. The badge number is replaced. It is absolute, not a delta, so a tab that
 *    slept through ten events converges on the first one it sees.
 * 2. A toast, for the tab that is actually being looked at.
 * 3. An OS notification, for the one that is not — the same treatment, and the
 *    same `Notification.permission` gate, as the admin inbox alert already
 *    uses. A toast in a background tab is not a notification.
 *
 * It also runs the one-time Web Push repair on mount (`ensurePushSubscribed`)
 * — the only code path that can re-establish a subscription for someone whose
 * browser already granted the permission, since the bell that asks for it
 * hides itself once granted.
 *
 * It does NOT call `router.refresh()`. That would re-run every server
 * component on the page — including the ones fetching a course, a lesson or a
 * quiz — for an event whose whole payload is already in hand. The screens that
 * need their own rows moved listen for a `queue` frame on `live-bus.ts` and
 * re-read just those rows (the payments desk); the others (the shipping queue)
 * still own a poller.
 */
export function NotificationStreamProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [unread, setUnread] = useState<number | null>(null);

  /*
    A ref, not a dependency.

    The handler closes over `router`, and putting it in the effect's dependency
    array would tear down and reopen the stream on every navigation — which on
    this app is often, and each reopen is a fresh connection the server has to
    subscribe to Redis for. The effect below runs exactly once per mount.
  */
  const onEvent = useRef<(event: MessageEvent<string>) => void>(() => undefined);

  const handle = useCallback(
    async (raw: string) => {
      /*
        `await import`, NOT a static import — and this is enforced, not a
        preference. `lib/client-barrel.test.ts` fails the build when Zod is
        statically reachable from anything a layout mounts, because this
        provider is mounted by BOTH shells: a top-level
        `import { NotificationEventSchema }` puts the whole of Zod in the
        client bundle of every signed-in route, to validate a frame that
        arrives a few times a day.

        Loaded on the first event instead. The chunk is fetched while a toast
        is about to be shown, which is the one moment the student is not
        waiting on anything.
      */
      const { NotificationEventSchema } = await import('@ayman/contracts/notifications');
      const parsed = NotificationEventSchema.safeParse(JSON.parse(raw));
      // A frame this build does not understand — a kind added by a newer
      // deployment during a rolling release. Ignored, never thrown: the feed
      // will render it correctly on the next read.
      if (!parsed.success) return;
      const event = parsed.data;
      /*
        An admin queue moved — «a payment request just arrived» reaching
        `/admin/payments` without a refresh. Not a notification: no toast, no
        badge of the bell's; the screens that draw that queue listen on the
        bus and re-read their own rows. See `live-bus.ts`.
      */
      if (event.type === 'queue') {
        emitQueueFrame(event.queue, event.waiting);
        return;
      }
      if (event.type !== 'notification') return;

      setUnread(event.unread);

      const view = describeNotification(event.notification);
      /*
        ⚠️ Only in a tab someone is LOOKING at, and one toast per kind.

        sonner pauses every toast's close timer while `document.hidden`, so in
        a background tab nothing ever leaves: an admin tab open all day in the
        background collected one toast per student question, homework and
        payment — thousands — and every new one re-rendered all the others,
        each handed its own copy of the whole list. That is the growth that
        took the tab down («Aw, Snap», code 5 — the renderer out of memory).
        The OS notification just below is what reaches a hidden tab; the badge
        count above still updates either way.

        `id` per kind: a burst of five student questions replaces one toast
        instead of stacking five, the same collapse `tag` gives the OS tray.
      */
      if (document.visibilityState === 'visible') {
        toast(view.title, {
          id: `live-${event.notification.kind}`,
          description: view.subtitle,
          action: { label: c.liveOpen, onClick: () => router.push(view.href) },
        });
      }

      /*
        The OS notification — the half that reaches someone whose tab is in the
        background. `tag` collapses repeats, so three approvals in a minute
        replace one another in the tray instead of stacking.

        Guarded on `Notification` EXISTING as well as being granted: the API is
        absent in an insecure context and on iOS Safari outside a Home Screen
        install, and reading `.permission` off `undefined` would throw inside a
        toast handler.
      */
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(view.title, {
          body: view.subtitle,
          tag: `ayman-notification-${event.notification.kind}`,
          lang: 'ar',
          dir: 'rtl',
        });
      }
    },
    [router],
  );

  /*
    The latest-ref pattern, assigned in an EFFECT and not during render.

    `handle` closes over `router`, so it is a new function after every
    navigation. Writing the ref during render is what the React compiler's
    `Cannot access refs during render` rule rejects — and it is right to: a ref
    written while rendering is a mutation the compiler cannot reason about when
    it decides what to memoise. Committing it here keeps the connection effect
    below free of `handle` in its dependencies, which is the whole point: the
    stream must survive navigation rather than reconnecting on every one.
  */
  useEffect(() => {
    onEvent.current = (event) => {
      // `void` — nothing awaits the handler, and a frame that failed to parse
      // must not reach the window's unhandled-rejection handler.
      void handle(event.data).catch(() => undefined);
    };
  }, [handle]);

  /*
    The push REPAIR, mounted here because this provider is the one thing both
    shells already mount for every signed-in person — see
    `ensurePushSubscribed`'s own note for the dead end it undoes (permission
    granted, no subscription, and the only button that could fix it hidden by
    the very permission that broke it).

    Deliberately separate from the EventSource effect below: that one must not
    be delayed, and this one must not tear the stream down when it resolves.
    It is also silent — a repair that runs on every page load has nothing
    useful to say to someone who never asked for it. The CLICK path is where a
    failure gets spoken aloud.
  */
  useEffect(() => {
    void import('@/lib/push-subscribe')
      .then(({ ensurePushSubscribed }) => ensurePushSubscribed())
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    let disposed = false;
    // Any frame at all, the heartbeat included — see `SILENCE_MS`.
    let lastFrameAt = Date.now();

    const open = () => {
      // Same-origin, so the session cookie rides along with no configuration —
      // `EventSource` cannot set headers, which is exactly why the endpoint is
      // authenticated by cookie like every other route rather than by a token.
      try {
        source = new EventSource('/api/me/notifications/stream');
      } catch {
        // No EventSource (an ancient browser, a locked-down webview). The bell
        // still works; it just updates on navigation instead of instantly.
        return;
      }
      source.onopen = () => {
        failures = 0;
        lastFrameAt = Date.now();
        // Every (re)connect, not just the first: whatever was published while
        // the connection was down is gone, and the live screens re-read.
        emitStreamOpen();
      };
      source.onmessage = (event: MessageEvent<string>) => {
        lastFrameAt = Date.now();
        onEvent.current(event);
      };
      /*
        Silent — `EventSource` reconnects on its own after a dropped connection
        and emits `error` on every attempt, and toasting that would turn a
        laptop waking from sleep into a wall of errors.

        ⚠️ Except that it does NOT retry when the reconnect gets an HTTP error:
        it goes to CLOSED for good. That is every deploy — Traefik answers 404
        or 502 while the new container comes up — so an admin tab open across a
        deploy lost its live updates until a manual refresh («ديما لازم أعمل
        ريفرش»). A CLOSED stream is reopened here, backing off from 5s to a
        minute with jitter, so a hundred tabs do not all knock at once.
      */
      source.onerror = () => {
        // Down either way — the browser reconnecting on its own included. The
        // `onopen` that ends it is what tells the live screens to re-read.
        emitStreamDown();
        if (disposed || source === null || source.readyState !== EventSource.CLOSED) return;
        source.close();
        source = null;
        failures += 1;
        const ceiling = Math.min(60_000, 5_000 * 2 ** (failures - 1));
        retry = setTimeout(open, ceiling / 2 + Math.random() * (ceiling / 2));
      };
    };

    open();

    /*
      The silent death `onerror` never reports. A stream that has said nothing
      for `SILENCE_MS` is closed and opened again, now, without the backoff: a
      dead socket is not a server outage, and if the server IS down the new
      stream fails with an HTTP error and falls into the backoff above anyway.
      Waiting first would only stretch the window in which every live screen
      is quietly wrong.
    */
    const watchdog = setInterval(() => {
      if (disposed || source === null || source.readyState !== EventSource.OPEN) return;
      if (Date.now() - lastFrameAt < SILENCE_MS) return;
      source.close();
      source = null;
      emitStreamDown();
      open();
    }, WATCHDOG_MS);

    return () => {
      disposed = true;
      clearInterval(watchdog);
      if (retry !== null) clearTimeout(retry);
      source?.close();
      emitStreamDown();
    };
  }, []);

  return <LiveUnreadContext.Provider value={unread}>{children}</LiveUnreadContext.Provider>;
}
