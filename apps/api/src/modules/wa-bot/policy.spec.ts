import { DEFAULT_BOT_SETTINGS, type BotSettings } from '@ayman/contracts/wa-bot/schemas';
import { cairoClock, decide, inQuietHours, quietEndsAt, type PolicyChat, type PolicyInput } from './policy';

/**
 * The safety rules, one at a time. Every case is a way the bot could embarrass
 * the instructor — or get a brand-new number banned — if the rule were missing.
 */

// 2026-10-28 14:00 Cairo (UTC+3 in October 2026 under the restored DST).
const NOON = new Date('2026-10-28T11:00:00Z');

const QUIET_CHAT: PolicyChat = {
  botPaused: false,
  optedOut: false,
  mutedUntil: null,
  humanRepliedAt: null,
  lastBotReplyAt: null,
  botRepliesDay: null,
  botRepliesToday: 0,
};

function input(chat: Partial<PolicyChat> = {}, settings: Partial<BotSettings> = {}, extra: Partial<PolicyInput> = {}): PolicyInput {
  return {
    now: NOON,
    featureOn: true,
    settings: { ...DEFAULT_BOT_SETTINGS, quietHoursEnabled: false, ...settings },
    chat: { ...QUIET_CHAT, ...chat },
    sentToday: 0,
    ...extra,
  };
}

describe('decide — whether the bot may speak in this chat right now', () => {
  it('answers an ordinary first message', () => {
    expect(decide(input())).toEqual({ kind: 'send' });
  });

  it('is silent with the entitlement or the device off', () => {
    expect(decide(input({}, {}, { featureOn: false }))).toEqual({ kind: 'skip', reason: 'disabled' });
  });

  it('is silent with the switch off', () => {
    expect(decide(input({}, { enabled: false }))).toEqual({ kind: 'skip', reason: 'disabled' });
  });

  it('never answers a number that said «قف» — not later, not ever', () => {
    expect(decide(input({ optedOut: true }))).toEqual({ kind: 'skip', reason: 'optedOut' });
  });

  it('is silent in a chat the admin paused', () => {
    expect(decide(input({ botPaused: true }))).toEqual({ kind: 'skip', reason: 'paused' });
  });

  it('is silent while a chat is muted as another bot', () => {
    expect(decide(input({ mutedUntil: new Date(NOON.getTime() + 60_000) }))).toEqual({ kind: 'skip', reason: 'muted' });
    expect(decide(input({ mutedUntil: new Date(NOON.getTime() - 60_000) }))).toEqual({ kind: 'send' });
  });

  describe('a person answered', () => {
    it('stays silent inside the window', () => {
      const humanRepliedAt = new Date(NOON.getTime() - 3 * 3_600_000);
      expect(decide(input({ humanRepliedAt }, { handoffSilenceHours: 12 }))).toEqual({ kind: 'skip', reason: 'human' });
    });

    it('speaks again once the window has passed', () => {
      const humanRepliedAt = new Date(NOON.getTime() - 13 * 3_600_000);
      expect(decide(input({ humanRepliedAt }, { handoffSilenceHours: 12 }))).toEqual({ kind: 'send' });
    });
  });

  describe('rate limits', () => {
    it('waits out the gap between two replies to one number instead of dropping the message', () => {
      const lastBotReplyAt = new Date(NOON.getTime() - 10_000);
      const decision = decide(input({ lastBotReplyAt }, { minGapSeconds: 30 }));
      expect(decision).toEqual({ kind: 'defer', until: new Date(lastBotReplyAt.getTime() + 30_000), reason: 'gap' });
    });

    it('answers once the gap has passed', () => {
      expect(decide(input({ lastBotReplyAt: new Date(NOON.getTime() - 31_000) }, { minGapSeconds: 30 }))).toEqual({
        kind: 'send',
      });
    });

    it('stops for the day at the per-number cap', () => {
      const chat = { botRepliesDay: cairoClock(NOON).day, botRepliesToday: 20 };
      expect(decide(input(chat, { perChatDailyCap: 20 }))).toEqual({ kind: 'skip', reason: 'chatCap' });
    });

    it('a new Cairo day resets the per-number count', () => {
      const chat = { botRepliesDay: '2026-10-27', botRepliesToday: 20 };
      expect(decide(input(chat, { perChatDailyCap: 20 }))).toEqual({ kind: 'send' });
    });

    it('stops for the day at the whole-device cap', () => {
      expect(decide(input({}, { dailyCap: 200 }, { sentToday: 200 }))).toEqual({ kind: 'skip', reason: 'dailyCap' });
    });
  });

  describe('quiet hours', () => {
    const night = new Date('2026-10-28T21:30:00Z'); // 00:30 Cairo

    it('defers a message that arrives in the night to the morning — never drops it', () => {
      const decision = decide(input({}, { quietHoursEnabled: true, quietStartHour: 23, quietEndHour: 8 }, { now: night }));
      expect(decision.kind).toBe('defer');
      if (decision.kind !== 'defer') return;
      expect(decision.reason).toBe('quiet');
      expect(cairoClock(decision.until).hour).toBe(8);
    });

    it('a «never» rule still beats quiet hours — an opted-out chat is skipped, not queued for the morning', () => {
      expect(
        decide(input({ optedOut: true }, { quietHoursEnabled: true, quietStartHour: 23, quietEndHour: 8 }, { now: night })),
      ).toEqual({ kind: 'skip', reason: 'optedOut' });
    });

    it.each([
      [23, 23, 8, true],
      [3, 23, 8, true],
      [8, 23, 8, false],
      [14, 23, 8, false],
      [14, 13, 15, true],
      [15, 13, 15, false],
      [5, 5, 5, false],
    ])('hour %i inside [%i, %i) is %s', (hour, start, end, expected) => {
      expect(inQuietHours(hour, start, end)).toBe(expected);
    });

    it('the end of quiet hours is the next one, not one in the past', () => {
      const until = quietEndsAt(night, 8);
      expect(until.getTime()).toBeGreaterThan(night.getTime());
      expect(until.getTime() - night.getTime()).toBeLessThan(9 * 3_600_000);
    });
  });
});
