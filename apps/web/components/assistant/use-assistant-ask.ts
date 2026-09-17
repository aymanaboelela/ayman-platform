'use client';

import { useCallback, useRef, useState } from 'react';
import {
  ASK_HISTORY_MAX,
  asAskEvent,
  type AskAction,
  type AskErrorCode,
  type AskTurn,
} from '@ayman/contracts/assistant/ask';
import { CSRF_HEADER, readCsrfToken } from '@/lib/csrf';

/**
 * The open chat's client half: one POST, read as it arrives.
 *
 * ## Why `fetch` and not `EventSource`
 *
 * `EventSource` is the obvious tool for `text/event-stream` and it cannot be
 * used here for two independent reasons: it only issues GETs (the question and
 * the history are a body, not a query string, and a question in a URL is a
 * question in a server log and in browser history), and it cannot set a header
 * (the CSRF token this route requires). A `fetch` whose body is read through a
 * `ReadableStream` reader gives the same event-by-event delivery with neither
 * limitation, and it can be ABORTED — which is what «إيقاف» is.
 *
 * ## The transcript is here and nowhere else
 *
 * No `sessionStorage`, no server row, no cache. It survives moving between the
 * panel's screens — the widget keeps `AssistantChat` mounted and hidden rather
 * than unmounting it, precisely so an answer is not thrown away by a tap on
 * another tab — and it ends when the panel closes or the page reloads.
 *
 * That last part is a choice, not a limitation. Persisting a support
 * conversation into `sessionStorage` would leave it sitting in the browser of
 * whatever machine it was typed on, which is the same thing
 * `Cache-Control: private, no-store` exists to prevent one route over. The
 * moment a conversation is worth keeping is the moment it becomes a real one,
 * and `POST /api/assistant/conversations` is what that costs.
 */

/** One bubble. */
export interface ChatMessage {
  readonly id: number;
  readonly role: 'user' | 'assistant';
  /** Grows as the answer streams in. */
  readonly text: string;
  /** المساعد asked for a human on this one — raises the «أكلّم م. أيمن» card. */
  readonly escalate: boolean;
  /**
   * Where the answer points — at most three real routes, drawn as links under
   * the bubble.
   *
   * Arrives on the `done` frame and is therefore ALWAYS empty while the answer
   * is streaming: the buttons appear once, complete, at the end, rather than
   * popping in one at a time under a paragraph that is still being read.
   * Already validated by `asAskEvent`, which drops any href this app does not
   * serve — so anything in here is safe to render as an anchor.
   */
  readonly actions: readonly AskAction[];
  /** The answer stopped badly. Rendered under whatever text did arrive. */
  readonly error: AskErrorCode | null;
}

export interface AssistantAsk {
  readonly messages: readonly ChatMessage[];
  /** A question is in flight — the composer is disabled and «إيقاف» is offered. */
  readonly busy: boolean;
  /** …and nothing has come back yet, which is the only moment «بيفكّر…» shows. */
  readonly waiting: boolean;
  ask: (question: string) => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Splits an SSE body into events.
 *
 * Chunks arrive on network boundaries, not on message ones, so a `data:` line
 * routinely lands split in half — the same class of problem `SentinelFilter`
 * solves on the server. The remainder after the last `\n\n` is kept for the
 * next chunk.
 */
function drain(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.split('\n\n');
  return { events: parts.slice(0, -1), rest: parts.at(-1) ?? '' };
}

export function useAssistantAsk(): AssistantAsk {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  /*
   * Ids are a counter rather than `crypto.randomUUID()`: they are React keys
   * and nothing else — never sent, never stored, never compared across
   * sessions — and `randomUUID` is unavailable outside a secure context, which
   * on a phone tethered to a laptop over plain http is a real place students
   * end up.
   */
  const nextId = useRef(0);
  const aborter = useRef<AbortController | null>(null);
  /*
   * The transcript, readable synchronously.
   *
   * `ask` needs the history at the moment it is called, and `messages` inside
   * a callback is whatever it was when the callback was created. Threading it
   * through a functional `setState` would work for the send and not for the
   * abort, so both read this instead and `setMessages` stays the only writer
   * of what is on screen.
   */
  const transcript = useRef<readonly ChatMessage[]>([]);

  const write = useCallback((next: readonly ChatMessage[]) => {
    transcript.current = next;
    setMessages(next);
  }, []);

  const stop = useCallback(() => {
    aborter.current?.abort();
    aborter.current = null;
    setBusy(false);
    setWaiting(false);
  }, []);

  const reset = useCallback(() => {
    aborter.current?.abort();
    aborter.current = null;
    write([]);
    setBusy(false);
    setWaiting(false);
  }, [write]);

  const ask = useCallback(
    (question: string) => {
      const asked = question.trim();
      if (!asked || aborter.current) return;

      /*
       * The history is the transcript MINUS anything that failed. Sending back
       * a half-written answer as if المساعد had said it teaches it to continue
       * from a sentence it never finished.
       */
      const history: AskTurn[] = transcript.current
        .filter((message) => message.error === null && message.text.trim().length > 0)
        .slice(-ASK_HISTORY_MAX)
        .map((message) => ({ role: message.role, text: message.text }));

      const answerId = nextId.current + 1;
      nextId.current += 2;
      write([
        ...transcript.current,
        {
          id: answerId - 1,
          role: 'user',
          text: asked,
          escalate: false,
          error: null,
          actions: [],
        },
        { id: answerId, role: 'assistant', text: '', escalate: false, error: null, actions: [] },
      ]);

      const patch = (change: Partial<ChatMessage>) => {
        write(
          transcript.current.map((message) =>
            message.id === answerId ? { ...message, ...change } : message,
          ),
        );
      };

      const controller = new AbortController();
      aborter.current = controller;
      setBusy(true);
      setWaiting(true);

      void (async () => {
        try {
          const response = await fetch('/api/assistant/ask', {
            method: 'POST',
            credentials: 'same-origin',
            signal: controller.signal,
            headers: {
              accept: 'text/event-stream',
              'content-type': 'application/json',
              [CSRF_HEADER]: readCsrfToken(),
            },
            body: JSON.stringify({ question: asked, history }),
          });

          /*
           * A 429 is not an event on the stream — the throttler answers before
           * the handler runs, so it arrives as an ordinary JSON error and the
           * body below never opens. Same for a 400 and for anything else that
           * went wrong before the first byte.
           */
          if (!response.ok || !response.body) {
            patch({ error: response.status === 429 ? 'tooMany' : 'failed' });
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let text = '';

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const { events, rest } = drain(buffer);
            buffer = rest;

            for (const frame of events) {
              const line = frame.split('\n').find((candidate) => candidate.startsWith('data:'));
              if (!line) continue;

              let parsed: unknown;
              try {
                parsed = JSON.parse(line.slice(5).trim());
              } catch {
                // A malformed frame is not worth ending an answer over — the
                // next one is a few milliseconds away.
                continue;
              }

              const event = asAskEvent(parsed);
              if (!event) continue;

              if (event.t === 'delta') {
                text += event.text;
                setWaiting(false);
                patch({ text });
              } else if (event.t === 'done') {
                // `actions` is absent on a frame from a server that predates
                // them, and `??` is what keeps that an answer with no buttons
                // rather than an answer that crashes the map below.
                patch({ escalate: event.escalate, actions: event.actions ?? [] });
              } else {
                patch({ error: event.code });
              }
            }
          }
        } catch (error) {
          // «إيقاف», a closed panel, or a navigation. The half-answer stays on
          // screen exactly as it was — it is not a failure and must not be
          // dressed as one.
          if (error instanceof DOMException && error.name === 'AbortError') return;
          patch({ error: 'failed' });
        } finally {
          if (aborter.current === controller) aborter.current = null;
          setBusy(false);
          setWaiting(false);
        }
      })();
    },
    [write],
  );

  return { messages, busy, waiting, ask, stop, reset };
}
