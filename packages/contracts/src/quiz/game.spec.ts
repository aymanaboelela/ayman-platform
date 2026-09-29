import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_MODE_CONFIG,
  GAME_POINTS,
  GAME_SECONDS_PER_QUESTION,
  GameHubCourseSchema,
  GameHubSchema,
  GameRoundSchema,
  GameStartRequestSchema,
  MILLIONAIRE_LADDER,
  clampGameSeconds,
  defaultGameModes,
  gameItemAllowed,
  gamePoints,
  gameScopeCounts,
  gameSessionCapSeconds,
  millionaireFloor,
  settleGame,
  totalOf,
} from './game';

describe('gamePoints', () => {
  it('pays the base for a right answer at the buzzer, and double for an instant one', () => {
    expect(gamePoints(0, 1)).toBe(GAME_POINTS.correct);
    expect(gamePoints(GAME_SECONDS_PER_QUESTION, 1)).toBe(GAME_POINTS.correct + GAME_POINTS.speedMax);
  });

  it('grows with the streak and stops at the cap', () => {
    expect(gamePoints(0, 2)).toBe(150);
    expect(gamePoints(0, 3)).toBe(200);
    expect(gamePoints(0, 50)).toBe(GAME_POINTS.correct * GAME_POINTS.comboMax);
  });

  it('never pays for time it did not have', () => {
    expect(gamePoints(-3, 1)).toBe(GAME_POINTS.correct);
    expect(gamePoints(999, 1)).toBe(GAME_POINTS.correct + GAME_POINTS.speedMax);
  });
});

describe('settleGame — the score the server believes', () => {
  it('pays the millionaire from the ladder: a win, a walk, and a fall onto the safe step', () => {
    const fifteen = (n: number, wrongAt = -1) => Array.from({ length: n }, (_, i) => i !== wrongAt);
    expect(settleGame({ mode: 'millionaire', level: 'medium', questionCount: 15, answers: fifteen(15) })).toEqual({
      outcome: 'won',
      score: MILLIONAIRE_LADDER[14],
    });
    expect(settleGame({ mode: 'millionaire', level: 'medium', questionCount: 15, answers: fifteen(7) })).toEqual({
      outcome: 'walked',
      score: MILLIONAIRE_LADDER[6],
    });
    // غلط في السؤال الـ٨ بعد ما عدّى الأمان الأول (الـ٥) = نقط الأمان.
    expect(settleGame({ mode: 'millionaire', level: 'medium', questionCount: 15, answers: fifteen(8, 7) })).toEqual({
      outcome: 'lost',
      score: MILLIONAIRE_LADDER[4],
    });
    // والمتصفح مالوش رأي: المليون نقطة اللي بيقولها مابتتحسبش.
    expect(
      settleGame({ mode: 'millionaire', level: 'medium', questionCount: 15, answers: [false], claimedScore: 1_000_000 }).score,
    ).toBe(0);
  });

  it('holds a race score between the slowest and the fastest the right answers could have earned', () => {
    const answers = [true, true, false, true];
    const cheat = settleGame({ mode: 'race', level: 'medium', questionCount: 10, answers, claimedScore: 99_999 });
    // أسرع حاجة: ٢٠٠ ×١، ٢٠٠ ×١٫٥، (غلط)، ٢٠٠ ×١ = ٧٠٠.
    expect(cheat).toEqual({ outcome: 'finished', score: 700 });
    // أبطأ حاجة: ١٠٠ + ١٥٠ + ١٠٠ = ٣٥٠ — حتى لو المتصفح ماقالش حاجة.
    expect(settleGame({ mode: 'race', level: 'medium', questionCount: 10, answers }).score).toBe(350);
    expect(settleGame({ mode: 'race', level: 'medium', questionCount: 10, answers, claimedScore: 500 }).score).toBe(500);
  });

  it('calls it lost when the hearts run out', () => {
    expect(settleGame({ mode: 'race', level: 'easy', questionCount: 10, answers: [false, false, false] }).outcome).toBe('lost');
    expect(settleGame({ mode: 'survival', level: 'easy', questionCount: 30, answers: [true, false] }).outcome).toBe('lost');
  });
});

describe('clampGameSeconds', () => {
  const start = new Date('2026-09-29T10:00:00Z');
  it('is server time between the start and now, never negative, never past the longest possible round', () => {
    expect(clampGameSeconds(start, new Date('2026-09-29T10:02:05Z'), 'race', 'medium')).toBe(125);
    expect(clampGameSeconds(start, new Date('2026-09-29T09:59:00Z'), 'race', 'medium')).toBe(0);
    expect(clampGameSeconds(start, new Date('2026-09-30T10:00:00Z'), 'millionaire', 'easy')).toBe(
      gameSessionCapSeconds('millionaire', 'easy'),
    );
    expect(gameSessionCapSeconds('race', 'hard')).toBe(10 * (15 + 20));
  });
});

describe('millionaireFloor', () => {
  it('keeps the last safe step passed', () => {
    const ladder = MILLIONAIRE_LADDER.slice(0, 15);
    expect(millionaireFloor(ladder, 4)).toBe(0);
    expect(millionaireFloor(ladder, 5)).toBe(ladder[4]);
    expect(millionaireFloor(ladder, 12)).toBe(ladder[9]);
  });
});

describe('gameItemAllowed / gameScopeCounts — the same filter on both sides', () => {
  const quizInLesson1 = { source: 'quiz' as const, lessonId: 'l1', sectionId: 's1' };
  const bankInLesson2 = { source: 'bank' as const, lessonId: 'l2', sectionId: 's2' };
  const general = { source: 'bank' as const, lessonId: null, sectionId: null };

  it('keeps today’s behaviour by default: everything, whole course', () => {
    for (const item of [quizInLesson1, bankInLesson2, general]) {
      expect(gameItemAllowed(item, DEFAULT_GAME_MODE_CONFIG, { kind: 'all' })).toBe(true);
    }
  });

  it('drops a source the course turned off, and the general pool when lessons are picked', () => {
    const onlyBank = { useQuizzes: false, useBank: true, lessonIds: [] };
    expect(gameItemAllowed(quizInLesson1, onlyBank, { kind: 'all' })).toBe(false);
    expect(gameItemAllowed(general, onlyBank, { kind: 'all' })).toBe(true);
    const lesson2 = { useQuizzes: true, useBank: true, lessonIds: ['l2'] };
    expect(gameItemAllowed(bankInLesson2, lesson2, { kind: 'all' })).toBe(true);
    expect(gameItemAllowed(quizInLesson1, lesson2, { kind: 'all' })).toBe(false);
    expect(gameItemAllowed(general, lesson2, { kind: 'all' })).toBe(false);
  });

  it('narrows to a unit or a lesson the student picked', () => {
    expect(gameItemAllowed(quizInLesson1, DEFAULT_GAME_MODE_CONFIG, { kind: 'section', id: 's1' })).toBe(true);
    expect(gameItemAllowed(bankInLesson2, DEFAULT_GAME_MODE_CONFIG, { kind: 'section', id: 's1' })).toBe(false);
    expect(gameItemAllowed(general, DEFAULT_GAME_MODE_CONFIG, { kind: 'lesson', id: 'l1' })).toBe(false);
    expect(gameItemAllowed(quizInLesson1, DEFAULT_GAME_MODE_CONFIG, { kind: 'lesson', id: 'l1' })).toBe(true);
  });

  it('adds the buckets up per mode, with each course’s own settings', () => {
    const course = GameHubCourseSchema.parse({
      id: 'c1',
      title: 'كورس',
      counts: { easy: 3, medium: 5, hard: 1 },
      buckets: [
        { ...quizInLesson1, counts: { easy: 2, medium: 3, hard: 1 } },
        { ...general, counts: { easy: 1, medium: 2, hard: 0 } },
      ],
      modes: { ...defaultGameModes(), race: { useQuizzes: false, useBank: true, lessonIds: [] } },
    });
    expect(gameScopeCounts([course], 'millionaire', { kind: 'all' })).toEqual({ easy: 3, medium: 5, hard: 1 });
    expect(gameScopeCounts([course], 'race', { kind: 'all' })).toEqual({ easy: 1, medium: 2, hard: 0 });
    expect(totalOf(gameScopeCounts([course], 'survival', { kind: 'lesson', id: 'l1' }))).toBe(6);
  });

  it('parses an old hub (no buckets, no settings) into today’s defaults', () => {
    const hub = GameHubSchema.parse({ total: 0, voice: false, courses: [{ id: 'c', title: 't', counts: { easy: 0, medium: 0, hard: 0 } }] });
    expect(hub.courses[0]!.modes.race).toEqual(DEFAULT_GAME_MODE_CONFIG);
    expect(hub.me.plays).toBe(0);
    expect(GameRoundSchema.parse({ mode: 'race', level: 'easy', questions: [], poolSize: 0 }).sessionId).toBeNull();
  });

  it('asks for a course and an id before it will scope a round', () => {
    expect(GameStartRequestSchema.safeParse({ mode: 'race', scope: 'lesson' }).success).toBe(false);
    expect(GameStartRequestSchema.safeParse({ mode: 'race' }).data?.scope).toBe('all');
  });
});
