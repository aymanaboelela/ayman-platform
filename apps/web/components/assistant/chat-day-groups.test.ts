import { describe, expect, it } from 'vitest';
import { buildChatTimeline } from './chat-timeline';
import { groupChatTimelineByDay } from './chat-day-groups';

const labels = { today: 'النهارده', yesterday: 'امبارح' };

/** 2026-09-29 14:00 in Cairo. */
const NOW = new Date('2026-09-29T11:00:00Z');

function message(id: string, author: 'visitor' | 'admin', createdAt: string) {
  return { id, author, createdAt, body: id };
}

describe('groupChatTimelineByDay — one box per day, for the sticky chip', () => {
  const timeline = buildChatTimeline(
    [
      message('a', 'visitor', '2026-09-27T09:00:00Z'),
      message('b', 'admin', '2026-09-28T09:00:00Z'),
      message('c', 'admin', '2026-09-28T09:01:00Z'),
      message('d', 'visitor', '2026-09-29T09:00:00Z'),
    ],
    { now: NOW, labels },
  );

  it('opens a group at every chip and files each message under its own day', () => {
    const groups = groupChatTimelineByDay(timeline);
    expect(groups.map((group) => group.key)).toEqual(['2026-09-27', '2026-09-28', '2026-09-29']);
    expect(groups.map((group) => group.entries.map((entry) => entry.message.id))).toEqual([
      ['a'],
      ['b', 'c'],
      ['d'],
    ]);
    expect(groups.at(-1)?.label).toBe(labels.today);
    expect(groups.at(-2)?.label).toBe(labels.yesterday);
  });

  it('keeps the run flags the flat timeline worked out', () => {
    const [, yesterday] = groupChatTimelineByDay(timeline);
    expect(yesterday?.entries.map((entry) => [entry.startsGroup, entry.endsGroup])).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it('is empty for an empty thread', () => {
    expect(groupChatTimelineByDay([])).toEqual([]);
  });
});
