import { describe, expect, it } from 'vitest';
import { GAME_POINTS, GAME_SECONDS_PER_QUESTION, gamePoints } from './game';

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
