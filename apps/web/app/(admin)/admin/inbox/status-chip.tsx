import { copy } from '@ayman/contracts';
import type { ConversationStatus } from '@ayman/contracts/assistant/conversation';
import { cn } from '@ayman/ui';

const c = copy.assistant.inbox;

/**
 * Timestamps on this screen, in the product's one convention: Western digits
 * through `-u-nu-latn`, matching `activity-feed.tsx`, `devices-list.tsx` and
 * `notification-view.ts`.
 */
export const inboxTimeFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'short',
  timeStyle: 'short',
});

/**
 * The status of a thread, as a coloured chip.
 *
 * Colour carries the meaning here rather than decorating it: this screen is
 * scanned, not read, and "which of these still needs me" has to survive being
 * looked at for half a second. The three states are genuinely different kinds
 * of thing — a debt, a completed action, a closed file — so they get three
 * different colours rather than three different words in the same grey.
 *
 * `unread` outranks `answered`: a thread he replied to and the student then
 * wrote back on is `open` again, and the chip has to say so.
 */
export function InboxStatusChip({
  status,
  unread,
}: {
  status: ConversationStatus;
  unread: boolean;
}) {
  const label = unread && status === 'open' ? c.unanswered : LABELS[status];

  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium',
        TONES[status],
      )}
    >
      {label}
    </span>
  );
}

const LABELS: Record<ConversationStatus, string> = {
  open: c.statusOpen,
  answered: c.statusAnswered,
  closed: c.statusClosed,
};

const TONES: Record<ConversationStatus, string> = {
  // Amber — the brand's ACTION colour, and this is the one status that is a
  // request for action.
  open: 'bg-accent text-[#1A1206]',
  // Green: done, and visibly not the same kind of thing as "waiting".
  answered: 'bg-[color-mix(in_oklch,var(--ok),transparent_84%)] text-[color:var(--ok)]',
  // Neutral: filed. Deliberately the quietest of the three.
  closed: 'border border-line text-fg-muted',
};
