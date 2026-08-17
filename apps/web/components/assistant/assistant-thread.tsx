'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import {
  ConversationThreadSchema,
  MESSAGE_MAX,
  type ConversationThread,
} from '@ayman/contracts/assistant/conversation';
import { cn } from '@ayman/ui/lib/cn';
import { apiPost, apiPostVoid } from '@/lib/api';
import { AymanAvatar } from './ayman-avatar';
import { MessageBody } from './message-body';
import { MessageAttachmentView } from './message-attachment';

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
 * asynchronous inbox honestly promises — a typing indicator with nobody behind
 * it would be a lie the interface tells every visitor.
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
      <ol className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-4">
        {thread.messages.map((message) => {
          const fromVisitor = message.author === 'visitor';
          return (
            <li
              key={message.id}
              className={cn('flex flex-col gap-1', fromVisitor ? 'items-start' : 'items-end')}
            >
              <span className="flex items-center gap-1.5 px-1 text-[length:var(--fs-text-xs)] text-fg-faint">
                {/*
                  His FACE on his own messages, and nothing on the student's.
                  «رسايل م. أيمن» opens threads he did not personally type, and
                  the photograph is what stops those reading as system notices
                  wearing his name — see `AymanAvatar`. The student needs no
                  avatar here: on their own side of a two-person chat, the side
                  of the panel already says who they are.
                */}
                {fromVisitor ? null : <AymanAvatar size="sm" />}
                {fromVisitor ? c.you : c.ayman}
              </span>
              <div
                className={cn(
                  'relative max-w-[85%] whitespace-pre-wrap wrap-anywhere rounded-2xl px-3.5 py-2.5',
                  'text-[length:var(--fs-text-sm)] leading-[1.7]',
                  fromVisitor
                    ? 'rounded-ss-md border border-line-subtle bg-surface-2 text-fg'
                    : // The instructor's replies carry the brand colour. He is
                      // the reason this surface exists, and his words should
                      // not look like the student's own echoed back.
                      'rounded-se-md bg-accent text-[#1A1206]',
                )}
              >
                {/*
                  TEXT NODES and `<a>` elements — never markup. There is no HTML
                  sink anywhere on this path, and that absence, not a sanitiser,
                  is the control; `MessageBody` splits the string on a URL
                  pattern and builds React elements, so nothing is ever parsed.

                  It has to make links pressable because «رسايل م. أيمن» sends
                  an invitation whose entire payload is a URL, and rendered as
                  one text node it could not be tapped at all.

                  `whitespace-pre-wrap` on the bubble above is what makes an
                  outreach message legible: it is written in paragraphs with a
                  bulleted list of topics in the middle, and collapsed to one
                  run of text the list becomes a wall.
                */}
                {/* An empty body is legal now — a message may be only a file
                    — and `MessageBody` on '' renders nothing, so the bubble
                    collapses to the attachment rather than reserving a line. */}
                <MessageBody body={message.body} />

                {message.attachment ? (
                  <MessageAttachmentView
                    attachment={message.attachment}
                    tone={fromVisitor ? 'other' : 'own'}
                    labels={{
                      imageAlt: c.attachmentImageAlt,
                      download: c.attachmentDownload,
                    }}
                  />
                ) : null}

                {/*
                  «ردّ بإيموجي» — READ ONLY on this side.
                  
                  The student sees what the instructor put on their message and
                  cannot set one: he was the one who asked for the gesture, and
                  a picker here would be a feature nobody requested on the
                  surface where it is hardest to get right. The column is
                  `admin_reaction` for the same reason — a `visitor_reaction`
                  beside it later is one nullable column and no migration.
                */}
                {message.adminReaction ? (
                  <span
                    // Overlapping the bottom edge, where WhatsApp puts it.
                    className={cn(
                      'absolute -bottom-2.5 grid h-5 min-w-5 place-items-center rounded-full px-1',
                      'border border-line-subtle bg-surface-1 leading-none',
                      'text-[length:var(--fs-text-xs)]',
                      fromVisitor ? 'start-3' : 'end-3',
                    )}
                  >
                    {message.adminReaction}
                  </span>
                ) : null}
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
        <form
          // `method="post"` — see `auth/login-form.tsx`. Without it a press
          // before hydration puts the message in the URL.
          method="post"
          onSubmit={send}
          className="border-t border-line-subtle p-3"
        >
          {error ? (
            <p role="alert" className="mb-2 text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
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
