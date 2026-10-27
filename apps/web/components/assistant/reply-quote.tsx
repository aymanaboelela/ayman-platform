'use client';

import { X } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import type { MessageReplyRef } from '@ayman/contracts/assistant/conversation';
import { cn } from '@ayman/ui/lib/cn';

const c = copy.assistant.chat;

/** The DOM id every bubble row carries, so a quote can find what it quotes. */
export function chatMessageDomId(id: string): string {
  return `chat-msg-${id}`;
}

/** How long the quoted bubble stays lit after a jump, in ms. */
const FLASH_MS = 1400;

/**
 * Brings the quoted message into view and lights it briefly — WhatsApp's tap
 * on a quote.
 *
 * Straight on the DOM rather than through state: the rows are rendered by the
 * server on the admin side and by a map on the student's, and threading a
 * "highlighted id" through both for a 1.4-second class is more machinery than
 * the effect. A quote of a message outside the student's window
 * (`THREAD_MESSAGE_WINDOW`) finds no row and does nothing, which is honest.
 */
export function jumpToMessage(id: string): void {
  const row = document.getElementById(chatMessageDomId(id));
  if (!row) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  row.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  row.classList.remove('chat-row--flash');
  // Re-trigger the animation when the same quote is tapped twice.
  void row.offsetWidth;
  row.classList.add('chat-row--flash');
  window.setTimeout(() => row.classList.remove('chat-row--flash'), FLASH_MS);
}

/** The words a quote shows — its text, or what kind of thing it quoted. */
export function replySnippet(reply: MessageReplyRef): string {
  if (reply.body.length > 0) return reply.body;
  if (reply.attachmentKind === 'image') return c.replyImage;
  if (reply.attachmentKind === 'voice') return c.replyVoice;
  if (reply.attachmentKind === 'document') return c.replyDocument;
  return c.replyRecord;
}

/**
 * The quote: a bar in the sender's colour, whose message it was, and two lines
 * of it.
 *
 * Two places draw it — inside a sent bubble, where tapping it jumps to the
 * original, and above the composer while a reply is being written, where it
 * carries an ✕ to drop the quote. `name` is resolved by the caller because only
 * the caller knows who «the other side» is: the student's name on his screen,
 * `tenantName()` on theirs.
 */
export function ReplyQuote({
  reply,
  name,
  own,
  onCancel,
  className,
}: {
  reply: MessageReplyRef;
  name: string;
  /** The quoted message is the READER's — its bar takes the brand colour. */
  own: boolean;
  /** Present only above the composer. */
  onCancel?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <span className="chat-quote__name">{name}</span>
      <span className="chat-quote__text">{replySnippet(reply)}</span>
    </>
  );

  if (onCancel) {
    return (
      <div className={cn('chat-quote chat-quote--staged', own ? 'chat-quote--own' : '', className)}>
        <span className="chat-quote__body">{body}</span>
        <button type="button" onClick={onCancel} aria-label={c.replyCancel} className="chat-icon-button">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => jumpToMessage(reply.id)}
      aria-label={`${c.replyJump}: ${name}`}
      className={cn('chat-quote', own ? 'chat-quote--own' : '', className)}
    >
      <span className="chat-quote__body">{body}</span>
    </button>
  );
}
