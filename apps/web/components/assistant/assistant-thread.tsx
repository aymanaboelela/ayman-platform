'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { copy } from '@ayman/contracts';
import {
  ConversationThreadSchema,
  MESSAGE_MAX,
  type ConversationThread,
} from '@ayman/contracts/assistant/conversation';
import { cn } from '@ayman/ui';
import { apiPost, apiPostVoid } from '@/lib/api';

const c = copy.assistant.thread;

const timeFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  hour: '2-digit',
  minute: '2-digit',
  day: 'numeric',
  month: 'short',
});

/**
 * The visitor's side of a conversation the instructor is answering.
 *
 * This IS a chat, so it looks like one — alternating bubbles, newest at the
 * bottom. The guide half deliberately does not (see `assistant-guide.tsx`);
 * the two halves look different because they ARE different, and a student who
 * has crossed from one to the other should be able to feel that they did.
 *
 * No polling. A reply arrives on the next page load, which is what an
 * asynchronous inbox honestly promises — a spinner that implies someone is
 * typing when nobody is would be a lie the interface tells every visitor.
 */
export function AssistantThread({
  thread,
  onUpdated,
}: {
  thread: ConversationThread;
  onUpdated: (thread: ConversationThread) => void;
}) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Land on the newest message. `block: 'nearest'` keeps this inside the
  // panel's own scroller instead of dragging the whole page.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [thread.messages.length]);

  /*
   * Being on screen IS having read it.
   *
   * Marking read here rather than in the launcher's click handler covers all
   * three ways this view is reached — opening the panel, following a reply
   * notification's `?assistant=1`, and sending a follow-up — instead of the
   * one the button knows about. State is only ever set from inside the async
   * callback, never synchronously in the effect body, which is the pattern
   * `submit-dialog.tsx` documents and `react-hooks/set-state-in-effect`
   * requires.
   */
  useEffect(() => {
    if (thread.unreadForVisitor === 0) return;
    let cancelled = false;
    void apiPostVoid(`/api/assistant/conversations/${thread.id}/read`)
      .then(() => {
        if (cancelled) return;
        onUpdated({ ...thread, unreadForVisitor: 0 });
      })
      // Nothing to tell the student here: they are reading the message. The
      // dot clears on the next page load instead.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [thread, onUpdated]);

  const isClosed = thread.status === 'closed';

  async function send(event: FormEvent) {
    event.preventDefault();
    if (pending || draft.trim().length === 0) return;
    setPending(true);
    setError(null);

    try {
      const updated = await apiPost(
        `/api/assistant/conversations/${thread.id}/messages`,
        ConversationThreadSchema,
        { message: draft },
      );
      setDraft('');
      onUpdated(updated);
    } catch {
      setError(copy.assistant.escalate.failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ol className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
        {thread.messages.map((message) => {
          const fromVisitor = message.author === 'visitor';
          return (
            <li
              key={message.id}
              className={cn('flex flex-col gap-1', fromVisitor ? 'items-start' : 'items-end')}
            >
              <span className="px-1 text-[length:var(--fs-text-xs)] text-fg-faint">
                {fromVisitor ? c.you : c.ayman}
              </span>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[length:var(--fs-text-sm)] leading-[1.7]',
                  fromVisitor
                    ? 'rounded-ss-md border border-line-subtle bg-surface-2 text-fg'
                    : // The instructor's replies carry the brand colour. He is
                      // the reason this surface exists, and his words should
                      // not look like the student's own echoed back.
                      'rounded-se-md bg-accent text-[#1A1206]',
                )}
              >
                {/* A TEXT node. There is no HTML sink anywhere on this path,
                    and that absence — not a sanitiser — is the control. */}
                {message.body}
              </div>
              <span className="px-1 text-[length:var(--fs-text-xs)] text-fg-faint">
                {timeFormatter.format(new Date(message.createdAt))}
              </span>
            </li>
          );
        })}
        <div ref={endRef} />
      </ol>

      {isClosed ? (
        <p className="border-t border-line-subtle px-4 py-3 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
          {c.closed}
        </p>
      ) : (
        <form onSubmit={send} className="border-t border-line-subtle p-3">
          {error ? (
            <p role="alert" className="mb-2 text-[length:var(--fs-text-sm)] text-[--err]">
              {error}
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={c.replyPlaceholder}
              rows={2}
              maxLength={MESSAGE_MAX}
              aria-label={c.replyPlaceholder}
              className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-line-subtle bg-surface-1 px-3 py-2 text-[length:var(--fs-text-sm)] text-fg placeholder:text-fg-faint"
            />
            <button
              type="submit"
              disabled={pending || draft.trim().length === 0}
              aria-label={c.send}
              className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-[#1A1206] transition-opacity duration-[160ms] ease-out hover:bg-accent-hover disabled:opacity-40"
            >
              <Send className="size-4" aria-hidden="true" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
