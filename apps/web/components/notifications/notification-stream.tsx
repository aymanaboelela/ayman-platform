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

const c = copy.notifications;

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
 * It does NOT call `router.refresh()`. That would re-run every server
 * component on the page — including the ones fetching a course, a lesson or a
 * quiz — for an event whose whole payload is already in hand. The screens that
 * need their own numbers moved (the payments queue, the shipping queue) own
 * pollers that already do it.
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
      if (event.type !== 'notification') return;

      setUnread(event.unread);

      const view = describeNotification(event.notification);
      toast(view.title, {
        description: view.subtitle,
        action: { label: c.liveOpen, onClick: () => router.push(view.href) },
      });

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

  useEffect(() => {
    // Same-origin, so the session cookie rides along with no configuration —
    // `EventSource` cannot set headers, which is exactly why the endpoint is
    // authenticated by cookie like every other route rather than by a token.
    let source: EventSource;
    try {
      source = new EventSource('/api/me/notifications/stream');
    } catch {
      // No EventSource (an ancient browser, a locked-down webview). The bell
      // still works; it just updates on navigation instead of instantly.
      return;
    }

    source.onmessage = (event: MessageEvent<string>) => onEvent.current(event);
    /*
      Deliberately empty. `EventSource` reconnects on its own, with backoff,
      and it emits `error` on every one of those attempts — logging or toasting
      here would turn a laptop waking from sleep into a wall of errors about a
      connection that is about to come back by itself.
    */
    source.onerror = () => undefined;

    return () => source.close();
  }, []);

  return <LiveUnreadContext.Provider value={unread}>{children}</LiveUnreadContext.Provider>;
}
