import { Check, CheckCheck, Clock3 } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';
import { chatTime } from './chat-timeline';

const c = copy.assistant.chat;

/**
 * Where an OWN message stands.
 *
 *  - `sending` — the optimistic bubble, before the server has it.
 *  - `sent`    — stored; the other side has not opened the thread since.
 *  - `seen`    — the other side opened the thread after it was written.
 *
 * `null` draws no mark at all, which is what the student's side uses: the
 * instructor's read time is his, and a student watching a «seen» tick on a
 * question nobody has answered yet is not a feature anybody asked for.
 */
export type ChatDelivery = 'sending' | 'sent' | 'seen' | null;

/**
 * The time — and, on his own messages, the ticks — tucked into the bottom
 * corner of a bubble, WhatsApp's way.
 *
 * ## Why it is drawn twice
 *
 * The visible copy is absolutely positioned in the corner, so it can share the
 * last line of the text instead of costing a line of its own. Something has to
 * keep the text from running underneath it, and the only thing that knows how
 * wide it is is itself: `ghost` renders the same content inline at the end of
 * the text, invisible, so the last line reserves exactly that width — and
 * wraps to a fresh line exactly when the stamp would not fit. A fixed spacer
 * width would be wrong the moment «معدّلة» or a tick joined the time.
 */
export function ChatMeta({
  createdAt,
  edited = false,
  delivery = null,
  variant = 'corner',
}: {
  createdAt: string;
  edited?: boolean;
  delivery?: ChatDelivery;
  /**
   * `corner` — over the last line of text (the usual case).
   * `ghost`  — the invisible twin that reserves the corner's room.
   * `line`   — its own line, for a bubble with no text to share one with.
   * `overlay`— a dark pill over a picture that has no caption.
   */
  variant?: 'corner' | 'ghost' | 'line' | 'overlay';
}) {
  const ghost = variant === 'ghost';
  return (
    <span
      className={cn('chat-meta', `chat-meta--${variant}`)}
      aria-hidden={ghost ? true : undefined}
    >
      {edited ? <span className="chat-meta__edited">{c.edited}</span> : null}
      {/* The zone is named, so the server and the browser agree on the
          HOUR. They can still disagree on the bytes: Node and the browser ship
          different ICU builds, and one of them spaces «4:45 م» with a
          narrow no-break space. Not worth a hydration error. */}
      <time dateTime={ghost ? undefined : createdAt} suppressHydrationWarning>
        {chatTime(createdAt)}
      </time>
      {delivery ? <DeliveryMark delivery={delivery} ghost={ghost} /> : null}
    </span>
  );
}

function DeliveryMark({ delivery, ghost }: { delivery: Exclude<ChatDelivery, null>; ghost: boolean }) {
  const label = delivery === 'seen' ? c.seen : delivery === 'sent' ? c.sent : c.sending;
  const Icon = delivery === 'seen' ? CheckCheck : delivery === 'sent' ? Check : Clock3;
  return (
    <span
      className={cn('chat-meta__tick', delivery === 'seen' ? 'chat-meta__tick--seen' : '')}
      // The tick is the whole message here and it is a picture, so it needs
      // words — but only once; the ghost twin says nothing.
      role={ghost ? undefined : 'img'}
      aria-label={ghost ? undefined : label}
      title={ghost ? undefined : label}
    >
      <Icon className="size-3.5" aria-hidden="true" />
    </span>
  );
}
