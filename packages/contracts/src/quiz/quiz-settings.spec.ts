import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REVIEW_OPTIONS_GRADED,
  DEFAULT_REVIEW_OPTIONS_PRACTICE,
  REVIEW_FLAGS,
  REVIEW_WINDOWS,
  QuizSettingsSchema,
  ReviewOptionsSchema,
} from './quiz-settings';

describe('review options matrix', () => {
  it('is exactly four windows by seven flags', () => {
    expect(REVIEW_WINDOWS).toHaveLength(4);
    expect(REVIEW_FLAGS).toHaveLength(7);
    for (const window of REVIEW_WINDOWS) {
      expect(Object.keys(DEFAULT_REVIEW_OPTIONS_GRADED[window]).sort()).toEqual(
        [...REVIEW_FLAGS].sort(),
      );
    }
  });

  it('rejects a matrix missing a window', () => {
    const { afterClose, ...incomplete } = DEFAULT_REVIEW_OPTIONS_GRADED;
    expect(ReviewOptionsSchema.safeParse(incomplete).success).toBe(false);
  });

  it('rejects a matrix missing a flag', () => {
    const broken = structuredClone(DEFAULT_REVIEW_OPTIONS_GRADED) as Record<string, unknown>;
    delete (broken.during as Record<string, unknown>).rightAnswer;
    expect(ReviewOptionsSchema.safeParse(broken).success).toBe(false);
  });

  it('shows nothing during a graded attempt', () => {
    expect(Object.values(DEFAULT_REVIEW_OPTIONS_GRADED.during).every((v) => v === false)).toBe(true);
  });

  it('shows correctness but NOT the right answer during a practice attempt', () => {
    expect(DEFAULT_REVIEW_OPTIONS_PRACTICE.during.correctness).toBe(true);
    expect(DEFAULT_REVIEW_OPTIONS_PRACTICE.during.rightAnswer).toBe(false);
  });

  it('defaults a quiz to practice mode with unlimited attempts and a 24h cooldown', () => {
    const parsed = QuizSettingsSchema.parse({ reviewOptions: DEFAULT_REVIEW_OPTIONS_PRACTICE });
    expect(parsed.mode).toBe('practice');
    expect(parsed.maxAttempts).toBe(0);
    expect(parsed.retryCooldownHours).toBe(24);
    expect(parsed.graceSeconds).toBe(60);
    expect(parsed.overdueHandling).toBe('autosubmit');
  });
});
