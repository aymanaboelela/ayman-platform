import { describe, expect, it } from 'vitest';
import {
  buildChatTimeline,
  chatDayKey,
  chatDayLabel,
  chatTime,
  monogramOf,
  type ChatTimelineEntry,
  type ChatTimelineMessage,
} from './chat-timeline';

const labels = { today: 'النهارده', yesterday: 'امبارح' };

/** 2026-09-29 14:00 in Cairo (UTC+3 in September). */
const NOW = new Date('2026-09-29T11:00:00Z');

function message(id: string, author: 'visitor' | 'admin', createdAt: string) {
  return { id, author, createdAt, body: id };
}

function shape<M extends ChatTimelineMessage>(entries: ChatTimelineEntry<M>[]): string[] {
  return entries.map((entry) =>
    entry.kind === 'day'
      ? `day:${entry.label}`
      : `${entry.message.id}${entry.startsGroup ? '<' : ''}${entry.endsGroup ? '>' : ''}`,
  );
}

describe('chat time is Cairo time', () => {
  /*
   * The admin thread renders on a server whose clock is UTC. Without a named
   * zone the stamp said one hour in the HTML and another after hydration, and
   * a message sent at 1 a.m. in Cairo landed on the previous day's chip.
   */
  it('puts a message on the day it was sent IN CAIRO, not in UTC', () => {
    // 22:30 UTC on the 28th is 01:30 on the 29th in Cairo.
    expect(chatDayKey(new Date('2026-09-28T22:30:00Z'))).toBe('2026-09-29');
  });

  it('prints the time in Western digits, in Cairo', () => {
    // 13:45 UTC → 4:45 PM in Cairo.
    expect(chatTime('2026-09-28T13:45:00Z')).toMatch(/^4:45\s?م$/u);
  });
});

describe('chatDayLabel', () => {
  it('says «النهارده» and «امبارح» by the calendar, not by 24 hours', () => {
    expect(chatDayLabel(new Date('2026-09-29T06:00:00Z'), NOW, labels)).toBe('النهارده');
    // 23:30 Cairo yesterday is only 14.5 hours ago — still yesterday.
    expect(chatDayLabel(new Date('2026-09-28T20:30:00Z'), NOW, labels)).toBe('امبارح');
    // 00:30 Cairo yesterday.
    expect(chatDayLabel(new Date('2026-09-27T21:30:00Z'), NOW, labels)).toBe('امبارح');
  });

  it('names the weekday within the week, and the full date past it', () => {
    const lastWeek = chatDayLabel(new Date('2026-09-26T09:00:00Z'), NOW, labels);
    expect(lastWeek).toContain('السبت');
    const older = chatDayLabel(new Date('2026-08-01T09:00:00Z'), NOW, labels);
    expect(older).toContain('2026');
    expect(older).toContain('أغسطس');
  });
});

describe('buildChatTimeline', () => {
  it('opens every day with a chip, and only once', () => {
    const entries = buildChatTimeline(
      [
        message('a', 'visitor', '2026-09-28T09:00:00Z'),
        message('b', 'admin', '2026-09-28T10:00:00Z'),
        message('c', 'visitor', '2026-09-29T09:00:00Z'),
      ],
      { now: NOW, labels },
    );
    expect(shape(entries)).toEqual(['day:امبارح', 'a<>', 'b<>', 'day:النهارده', 'c<>']);
  });

  it('runs consecutive messages from one side together, within five minutes', () => {
    const entries = buildChatTimeline(
      [
        message('a', 'visitor', '2026-09-29T09:00:00Z'),
        message('b', 'visitor', '2026-09-29T09:01:00Z'),
        message('c', 'visitor', '2026-09-29T09:04:00Z'),
        // Six minutes later — a new breath, a new run.
        message('d', 'visitor', '2026-09-29T09:10:00Z'),
        message('e', 'admin', '2026-09-29T09:11:00Z'),
        message('f', 'admin', '2026-09-29T09:12:00Z'),
      ],
      { now: NOW, labels },
    );
    expect(shape(entries)).toEqual(['day:النهارده', 'a<', 'b', 'c>', 'd<>', 'e<', 'f>']);
  });

  it('never runs across a day chip', () => {
    const entries = buildChatTimeline(
      [
        // 23:59 and 00:01 Cairo: two minutes apart, two different days.
        message('a', 'admin', '2026-09-28T20:59:00Z'),
        message('b', 'admin', '2026-09-28T21:01:00Z'),
      ],
      { now: NOW, labels },
    );
    expect(shape(entries)).toEqual(['day:امبارح', 'a<>', 'day:النهارده', 'b<>']);
  });

  it('keeps a standalone card out of the runs either side of it', () => {
    const entries = buildChatTimeline(
      [
        message('a', 'visitor', '2026-09-29T09:00:00Z'),
        message('transcript', 'visitor', '2026-09-29T09:00:30Z'),
        message('c', 'visitor', '2026-09-29T09:01:00Z'),
      ],
      { now: NOW, labels, standalone: (entry) => entry.id === 'transcript' },
    );
    expect(shape(entries)).toEqual(['day:النهارده', 'a<>', 'transcript<>', 'c<>']);
  });

  it('returns nothing for an empty thread', () => {
    expect(buildChatTimeline([], { now: NOW, labels })).toEqual([]);
  });
});

describe('monogramOf', () => {
  it('takes the first letter, skipping stray punctuation a guest typed', () => {
    expect(monogramOf('مريم عبد الرحمن')).toBe('م');
    expect(monogramOf('  «سارة»')).toBe('س');
    expect(monogramOf('')).toBe('');
  });
});
