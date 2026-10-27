import type { ChallengeCandidate } from '../quiz/challenge-pool';
import { earnedKeys } from './badges.service';
import { pickDaily } from './daily.service';
import { defaultRecapMonth } from './recap.service';

function candidate(versionId: string, lessonId: string, bankEntryId = versionId): ChallengeCandidate {
  return {
    versionId,
    bankEntryId,
    variantGroupKey: null,
    courseId: 'course',
    lessonId,
    sectionId: 'section',
    forGeneral: true,
    forLanguages: true,
  };
}

describe('pickDaily', () => {
  const pool = [candidate('v1', 'opened'), candidate('v2', 'unopened'), candidate('v3', 'opened')];

  it('draws from the lectures the student has opened', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      expect(pickDaily(pool, new Set(['opened']), new Set(), seed)?.lessonId).toBe('opened');
    }
  });

  it('falls back to every lecture when none was opened', () => {
    expect(pickDaily(pool, new Set(), new Set(), 'x')).not.toBeNull();
  });

  it('is the same card for the same seed, whatever order the bank came in', () => {
    const first = pickDaily(pool, new Set(['opened']), new Set(), 'user:2026-10-27');
    const again = pickDaily([...pool].reverse(), new Set(['opened']), new Set(), 'user:2026-10-27');
    expect(again?.versionId).toBe(first?.versionId);
  });

  it('skips a recent question while a fresh one is left, and repeats rather than go empty', () => {
    const recent = new Set(['v1']);
    for (const seed of ['a', 'b', 'c', 'd']) {
      expect(pickDaily(pool, new Set(['opened']), recent, seed)?.versionId).toBe('v3');
    }
    expect(pickDaily(pool, new Set(['opened']), new Set(['v1', 'v3']), 'a')).not.toBeNull();
  });

  it('is null with nothing to ask', () => {
    expect(pickDaily([], new Set(), new Set(), 'a')).toBeNull();
  });
});

describe('earnedKeys', () => {
  const zero = {
    lessons: 0,
    quizzes: 0,
    fullMarks: 0,
    streak: 0,
    daily: 0,
    homework: 0,
    mistakes: 0,
    notes: 0,
    arena: 0,
    courses: 0,
  };

  it('earns every rung at or under the number', () => {
    expect(earnedKeys({ ...zero, lessons: 25, streak: 3 }, ['lessons', 'streak'])).toEqual([
      'lessons:bronze',
      'lessons:silver',
      'streak:bronze',
    ]);
  });

  it('earns nothing on a family this stack does not have', () => {
    expect(earnedKeys({ ...zero, arena: 50 }, ['lessons'])).toEqual([]);
  });
});

describe('defaultRecapMonth', () => {
  it('opens on last month during the first week', () => {
    expect(defaultRecapMonth('2026-11-03', ['2026-11', '2026-10'])).toBe('2026-10');
  });

  it('opens on this month after that, or when last month had nothing', () => {
    expect(defaultRecapMonth('2026-11-12', ['2026-11', '2026-10'])).toBe('2026-11');
    expect(defaultRecapMonth('2026-11-03', ['2026-11'])).toBe('2026-11');
  });

  it('crosses the year', () => {
    expect(defaultRecapMonth('2027-01-02', ['2027-01', '2026-12'])).toBe('2026-12');
  });
});
