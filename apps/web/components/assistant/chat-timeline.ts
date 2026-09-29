/**
 * The shape both ends of a conversation are drawn from — the instructor's
 * `/admin/inbox/[id]` and the student's panel — so the two screens cannot
 * disagree about where a day starts or which bubbles belong together.
 *
 * ## Cairo time, named, on both sides of the render
 *
 * The admin thread is rendered on the server and the server's clock is UTC,
 * while every reader of this platform is in Egypt. A formatter with no
 * `timeZone` printed «10:45» in the HTML and «1:45 م» after hydration — the
 * same message, two times, one of them wrong. Naming `Africa/Cairo` makes the
 * server and the browser agree, and makes «النهارده» mean the day the reader
 * is actually living in.
 *
 * Western digits through `-u-nu-latn`, the product's one convention for
 * numbers (see `inboxTimeFormatter`).
 */

export const CHAT_TIME_ZONE = 'Africa/Cairo';

/**
 * Two messages from the same side further apart than this start a new group.
 *
 * Five minutes is the gap at which «and another thing» stops reading as the
 * same breath — and the grouping only decides corners, avatars and spacing,
 * so erring either way costs a few pixels, never a misread.
 */
export const CHAT_GROUP_GAP_MS = 5 * 60 * 1000;

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CHAT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: CHAT_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});

const weekdayFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: CHAT_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const fullDateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: CHAT_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** `2026-09-28` — the Cairo calendar day an instant falls on. */
export function chatDayKey(at: Date): string {
  return dayKeyFormatter.format(at);
}

/** «4:45 م» — the stamp inside a bubble. */
export function chatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

/**
 * The day BEFORE a `YYYY-MM-DD` key, done on the calendar rather than by
 * subtracting 24 hours from an instant: Egypt moves its clocks, and on the two
 * days a year it does, «now minus a day» lands on the wrong date for an hour.
 */
function previousDayKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return previous.toISOString().slice(0, 10);
}

/**
 * The chip between days: «النهارده», «امبارح», a weekday for this week, and a
 * full date with the year once it is older than that.
 *
 * `now` is a parameter so a render and a test can both say which day it is.
 */
export function chatDayLabel(
  at: Date,
  now: Date,
  labels: { today: string; yesterday: string },
): string {
  const key = chatDayKey(at);
  const today = chatDayKey(now);
  if (key === today) return labels.today;
  if (key === previousDayKey(today)) return labels.yesterday;
  // A week back is still «the Monday just gone»; past that a weekday is a
  // riddle, and the date is what the reader needs.
  const ageMs = now.getTime() - at.getTime();
  if (ageMs >= 0 && ageMs < 6 * 24 * 60 * 60 * 1000) return weekdayFormatter.format(at);
  return fullDateFormatter.format(at);
}

export interface ChatTimelineMessage {
  id: string;
  author: string;
  createdAt: string;
}

export type ChatTimelineEntry<M extends ChatTimelineMessage> =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'message';
      message: M;
      /** First of a run from one side — carries the tail-less top corner and the byline. */
      startsGroup: boolean;
      /** Last of a run — carries the tail and the avatar. */
      endsGroup: boolean;
    };

/**
 * Messages → a flat list of day chips and messages, each message told whether
 * it opens or closes its run.
 *
 * `standalone` marks a message that is drawn as its own card rather than as a
 * bubble (المساعد's transcript on the admin side): it never joins a run, and
 * the bubbles either side of it do not join across it.
 */
export function buildChatTimeline<M extends ChatTimelineMessage>(
  messages: readonly M[],
  options: {
    /**
     * Which day it is, for «النهارده» and «امبارح». Defaults to the clock — a
     * test passes one, and so may a caller that already read it.
     */
    now?: Date;
    labels: { today: string; yesterday: string };
    standalone?: (message: M) => boolean;
  },
): ChatTimelineEntry<M>[] {
  const entries: ChatTimelineEntry<M>[] = [];
  const isStandalone = options.standalone ?? (() => false);
  const now = options.now ?? new Date();

  let lastDay: string | null = null;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;
    const at = new Date(message.createdAt);
    const day = chatDayKey(at);
    if (day !== lastDay) {
      entries.push({ kind: 'day', key: day, label: chatDayLabel(at, now, options.labels) });
      lastDay = day;
    }

    const previous = messages[index - 1];
    const next = messages[index + 1];
    entries.push({
      kind: 'message',
      message,
      startsGroup: !previous || !sameRun(previous, message, isStandalone),
      endsGroup: !next || !sameRun(message, next, isStandalone),
    });
  }
  return entries;
}

function sameRun<M extends ChatTimelineMessage>(
  earlier: M,
  later: M,
  isStandalone: (message: M) => boolean,
): boolean {
  if (earlier.author !== later.author) return false;
  if (isStandalone(earlier) || isStandalone(later)) return false;
  const a = new Date(earlier.createdAt);
  const b = new Date(later.createdAt);
  if (chatDayKey(a) !== chatDayKey(b)) return false;
  return b.getTime() - a.getTime() <= CHAT_GROUP_GAP_MS;
}

/**
 * The first letter or digit of a name, for an avatar that has no photograph.
 * Same rule as `AymanAvatar`'s monogram: a stray quote or space in a typed
 * name must not become the circle's only glyph.
 */
export function monogramOf(name: string): string {
  return name.match(/[\p{L}\p{N}]/u)?.[0] ?? '';
}
