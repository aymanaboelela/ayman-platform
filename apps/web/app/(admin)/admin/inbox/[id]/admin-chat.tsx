'use client';

import { useOptimistic, type ReactNode } from 'react';
import { Paperclip } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import type {
  ConversationStatus,
  MessageAttachmentInput,
  MessageAuthor,
} from '@ayman/contracts/assistant/conversation';
import { ChatMeta } from '@/components/assistant/chat-meta';
import { ChatViewport } from '@/components/assistant/chat-viewport';
import { MessageBody } from '@/components/assistant/message-body';
import { ThreadActions } from './thread-actions';

const cc = copy.assistant.chat;

/** A reply on its way — drawn at the bottom of the thread before the server has it. */
export interface PendingReply {
  body: string;
  attachment: MessageAttachmentInput | null;
  /** When he pressed send, by his own clock. Only ever drawn as «now». */
  at: string;
}

/**
 * The chat panel of one conversation: the scrolling thread and the composer
 * docked under it, as ONE object — which is what makes it a messenger rather
 * than a page with a form at the bottom.
 *
 * The messages themselves are still rendered on the server and arrive here as
 * `children`; this component owns only what has to live in the browser — the
 * scroll (see `ChatViewport`) and the reply that has been sent but not yet
 * stored.
 *
 * ## The optimistic reply
 *
 * `useOptimistic`, not a `useState` cleared after the action returns. The reply
 * travels as a Server Action whose response carries the refreshed thread, and
 * `useOptimistic` drops the placeholder in the SAME commit that paints the real
 * message — a state cleared by hand after the `await` can land a frame before
 * the tree does, and the bubble blinks out and back in. On a failure the
 * placeholder simply goes, and the composer gets its words back (see
 * `ThreadActions`).
 */
export function AdminChat({
  id,
  status,
  latest,
  children,
}: {
  id: string;
  status: ConversationStatus;
  /** The newest stored message — what the viewport follows. */
  latest: { id: string; createdAt: string; author: MessageAuthor } | null;
  children: ReactNode;
}) {
  const [pending, setPending] = useOptimistic<PendingReply | null>(null);

  const followed = pending
    ? { key: `pending:${pending.at}`, at: pending.at, fromSelf: true }
    : latest
      ? { key: latest.id, at: latest.createdAt, fromSelf: latest.author === 'admin' }
      : null;

  return (
    <section className="chat chat--admin">
      <ChatViewport latest={followed} label={cc.regionLabel}>
        {children}
        {pending ? (
          <ol className="chat-list" aria-live="polite">
            <li className="chat-row chat-row--own chat-row--start chat-row--end chat-row--pending">
              <div className="chat-row__stack">
                <div className="chat-row__line">
                  <div className="chat-bubble">
                    {pending.attachment ? (
                      <span className="chat-pending-file">
                        <Paperclip className="size-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{pending.attachment.filename}</span>
                      </span>
                    ) : null}
                    {pending.body.trim().length > 0 ? (
                      <div className="chat-text">
                        <MessageBody body={pending.body} trusted />
                        <ChatMeta createdAt={pending.at} delivery="sending" variant="ghost" />
                      </div>
                    ) : null}
                    <ChatMeta
                      createdAt={pending.at}
                      delivery="sending"
                      variant={pending.body.trim().length > 0 ? 'corner' : 'line'}
                    />
                  </div>
                </div>
              </div>
            </li>
          </ol>
        ) : null}
      </ChatViewport>
      <ThreadActions id={id} status={status} onPending={setPending} />
    </section>
  );
}
