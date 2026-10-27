import type { ChallengeCandidate } from '../quiz/challenge-pool';
import { buildDeck } from './cards.service';
import { settle } from './focus.service';
import { rankStandings } from './league.service';

function candidate(bankEntryId: string, lessonId = 'opened'): ChallengeCandidate {
  return {
    versionId: `v-${bankEntryId}`,
    bankEntryId,
    variantGroupKey: null,
    courseId: 'course',
    lessonId,
    sectionId: 'section',
    forGeneral: true,
    forLanguages: true,
  };
}

describe('buildDeck', () => {
  const today = '2026-10-27';

  it('puts due cards first, the shakiest box first, and leaves future ones out', () => {
    const bank = ['a', 'b', 'c', 'd'].map((id) => candidate(id));
    const boxes = new Map([
      ['a', { box: 3, dueOn: '2026-10-26' }],
      ['b', { box: 1, dueOn: today }],
      ['c', { box: 2, dueOn: '2026-11-02' }],
    ]);
    const deck = buildDeck(bank, boxes, new Set(['opened']), today, 'seed', 3).map((card) => card.bankEntryId);
    expect(deck.slice(0, 2)).toEqual(['b', 'a']);
    expect(deck).not.toContain('c');
    expect(deck[2]).toBe('d');
  });

  it('fills with new cards from opened lectures, and from any lecture when none was opened', () => {
    const bank = [candidate('x', 'opened'), candidate('y', 'closed')];
    expect(buildDeck(bank, new Map(), new Set(['opened']), today, 's').map((card) => card.bankEntryId)).toEqual(['x']);
    expect(buildDeck(bank, new Map(), new Set(), today, 's')).toHaveLength(2);
  });

  it('deals the same new cards for the same seed, whatever order the bank came in', () => {
    const bank = Array.from({ length: 30 }, (_, index) => candidate(`n${index}`));
    const first = buildDeck(bank, new Map(), new Set(['opened']), today, 'user:day').map((card) => card.bankEntryId);
    const again = buildDeck([...bank].reverse(), new Map(), new Set(['opened']), today, 'user:day').map((card) => card.bankEntryId);
    expect(again).toEqual(first);
    expect(first).toHaveLength(10);
  });
});

describe('settle', () => {
  const startedAt = new Date('2026-10-27T10:00:00Z');

  it('finishes a sitting stopped at its end, or a few seconds short of it', () => {
    const late = settle({ id: 's', startedAt, minutes: 25 }, new Date('2026-10-27T12:00:00Z'));
    expect(late).toMatchObject({ completed: true, minutes: 25 });
    expect(late.endedAt.toISOString()).toBe('2026-10-27T10:25:00.000Z');
    expect(settle({ id: 's', startedAt, minutes: 25 }, new Date('2026-10-27T10:24:50Z')).completed).toBe(true);
  });

  it('counts the minutes of a sitting stopped early, but not as finished', () => {
    expect(settle({ id: 's', startedAt, minutes: 25 }, new Date('2026-10-27T10:12:30Z'))).toMatchObject({
      completed: false,
      minutes: 12,
    });
  });
});

describe('rankStandings', () => {
  const zero = { lesson: 0, quiz: 0, homework: 0, daily: 0, dailyRight: 0, focus: 0 };

  it('ranks by points, shares a rank on a tie, and leaves zero off the table', () => {
    const ranked = rankStandings([
      { userId: 'c', counts: zero, points: 20 },
      { userId: 'a', counts: zero, points: 50 },
      { userId: 'b', counts: zero, points: 20 },
      { userId: 'd', counts: zero, points: 5 },
      { userId: 'e', counts: zero, points: 0 },
    ]);
    expect(ranked.map((row) => [row.userId, row.rank])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 2],
      ['d', 4],
    ]);
  });
});
