'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { onStreamOpen, subscribeChat } from '@/components/notifications/live-bus';

/** Frames come in bursts — a reply is a `chat` frame plus, for the other
 *  admins, the same frame again from each write in the click. One redraw. */
const COALESCE_MS = 300;

/**
 * «الشات مش ريل تايم» — redraws the server-rendered inbox screen it sits on
 * when the live stream says a conversation moved.
 *
 * With `conversationId`, only frames about that thread count (the open chat);
 * without it, any thread does (the list, where every row is a thread).
 *
 * `router.refresh()` is the right tool here, unlike for the bell
 * (`notification-stream.tsx` explains why it avoids it): these pages ARE the
 * conversation, rendered on the server through uncached `adminGet`, so
 * re-running them is exactly the re-read the frame asks for — and it keeps
 * client state, so a half-typed reply in the composer survives it.
 *
 * ⚠️ Only while the tab is in FRONT. Opening a thread is what marks it read on
 * the server (`GET /api/admin/conversations/:id`), so redrawing it in a
 * background tab would mark a message read that nobody has seen — the sidebar
 * badge would clear and the alert would never fire. A frame that arrives while
 * hidden is remembered and replayed when the tab comes back.
 */
export function LiveChatRefresh({ conversationId }: { conversationId?: string }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let missed = false;

    const refresh = () => {
      if (document.visibilityState !== 'visible') {
        missed = true;
        return;
      }
      missed = false;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), COALESCE_MS);
    };

    const offChat = subscribeChat((id) => {
      if (conversationId === undefined || id === null || id === conversationId) refresh();
    });
    // A reconnect may have swallowed frames — see `live-bus.ts`.
    const offOpen = onStreamOpen(refresh);
    const onVisible = () => {
      if (missed && document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timer !== null) clearTimeout(timer);
      offChat();
      offOpen();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [conversationId, router]);

  return null;
}
