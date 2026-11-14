'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeChat, subscribeTyping } from '@/components/notifications/live-bus';

/**
 * How long «جارٍ الكتابة…» stays up after the last frame. The sender pings
 * every `TYPING_PING_MS` while typing, so this outlives one missed ping and
 * drops soon after they stop — a bubble that lingers after the other side put
 * the phone down is the lie the old note in `assistant-thread.tsx` warned of.
 */
const TYPING_TTL_MS = 6_000;
/** How often a composer that is being typed into says so. */
const TYPING_PING_MS = 3_500;

/**
 * Whether the OTHER side of `conversationId` is typing right now — `from` is
 * who that other side is. Cleared the moment a message lands in the thread
 * (a `chat` frame), so the dots give way to the bubble rather than sitting
 * under it for the rest of the TTL.
 */
export function usePeerTyping(conversationId: string | null, from: 'visitor' | 'admin'): boolean {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      setTyping(false);
    };
    const offTyping = subscribeTyping((id, who) => {
      if (id !== conversationId || who !== from) return;
      setTyping(true);
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(stop, TYPING_TTL_MS);
    });
    const offChat = subscribeChat((id) => {
      if (id === conversationId) stop();
    });
    return () => {
      if (timer !== null) clearTimeout(timer);
      offTyping();
      offChat();
    };
  }, [conversationId, from]);

  return typing;
}

/**
 * The composer's half: call the returned function on every keystroke and it
 * pings `send` at most once per `TYPING_PING_MS`, and only while there is
 * text. Fire-and-forget — a typing ping that fails is not worth a word to
 * anyone.
 */
export function useTypingSignal(send: (() => Promise<unknown>) | null): (text: string) => void {
  const last = useRef(0);
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  return useCallback((text: string) => {
    const fire = sendRef.current;
    if (!fire || text.trim().length === 0) return;
    const now = Date.now();
    if (now - last.current < TYPING_PING_MS) return;
    last.current = now;
    void fire().catch(() => undefined);
  }, []);
}
