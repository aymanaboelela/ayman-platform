import type { ChatTimelineEntry, ChatTimelineMessage } from './chat-timeline';

type MessageEntry<M extends ChatTimelineMessage> = Extract<ChatTimelineEntry<M>, { kind: 'message' }>;

export interface ChatDayGroup<M extends ChatTimelineMessage> {
  key: string;
  label: string;
  entries: MessageEntry<M>[];
}

/**
 * The flat timeline → one group per day, each with its chip and its messages.
 *
 * ## Why the chip needs a box of its own
 *
 * `.chat-day` is sticky, and a sticky box is held inside its PARENT. With
 * every chip and every bubble in one list, that parent was the whole
 * conversation, so each chip stayed pinned for the rest of the thread: scroll
 * back across three days and three chips sat at the same spot, the newest on
 * top and the wider ones showing round its edges — «النهارده» half over
 * «امبارح». Each day in its own list gives each chip a parent that ends where
 * the day ends, so the day before is pushed up and out by the one after it,
 * and one chip is ever at the top.
 *
 * Its own module, beside `buildChatTimeline` rather than in it: a new file is
 * always safe for a tab that outlived a deploy, where a new export on a module
 * the widget's chunk already loaded is not.
 */
export function groupChatTimelineByDay<M extends ChatTimelineMessage>(
  timeline: readonly ChatTimelineEntry<M>[],
): ChatDayGroup<M>[] {
  const groups: ChatDayGroup<M>[] = [];
  for (const entry of timeline) {
    if (entry.kind === 'day') {
      groups.push({ key: entry.key, label: entry.label, entries: [] });
      continue;
    }
    // `buildChatTimeline` opens every day with its chip, so a message always
    // has a group to join; the guard is for a hand-built list that does not.
    const current = groups.at(-1);
    if (current) current.entries.push(entry);
  }
  return groups;
}
