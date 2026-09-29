import { cleanup, render, screen } from '@testing-library/react';
import type { QuizHistoryRow } from '@ayman/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { QuizResultRow } from './quiz-result-row';

// Explicit, as every component test in this repo does it — `vitest.setup.ts`
// registers no automatic cleanup.
afterEach(() => {
  cleanup();
});

const base: QuizHistoryRow = {
  lessonId: '0198c3a2-0000-7000-8000-000000000001',
  quizTitle: 'كويز المحاضرة الثانية',
  courseTitle: 'الكورس التأسيسي لمادة البرمجة',
  courseSlug: 'programming-foundation-2027',
  attemptsUsed: 1,
  allowsImprovement: false,
  improvementUsed: false,
  bestPercent: 55,
  latestPercent: 55,
  latestAttemptId: '0198c3a2-0000-7000-8000-000000000002',
  passed: false,
  lastSubmittedAt: '2026-08-14T00:00:00.000Z',
};

/**
 * The regression these pin down is a SCORE THAT LOOKS PASSED.
 *
 * `Figure` used to colour the «أحسن» percentage on `percent >= 50`, and 50 is
 * not a pass mark anywhere on this platform — each quiz carries its own
 * `passPercent`, and production's foundation exam uses 70. So every score from
 * 50 to 69 printed green here while `passed` was false and every other screen
 * said otherwise. 55 is the fixture above for exactly that reason: under the
 * old rule it is green, under the correct one it is red.
 *
 * Asserted on the resolved colour rather than on a class name, so the test
 * fails if the token is swapped as well as if the condition is.
 */
describe('QuizResultRow', () => {
  const bestFigure = () =>
    screen.getAllByText('55%').find((el) => el.tagName === 'DD') as HTMLElement;

  it('colours a 55% best as FAILED when the quiz says so', () => {
    render(<QuizResultRow row={base} />);

    expect(bestFigure().className).toContain('var(--err)');
    expect(bestFigure().className).not.toContain('var(--ok)');
  });

  it('colours the same 55% as passed when the quiz’s own mark is lower', () => {
    render(<QuizResultRow row={{ ...base, passed: true }} />);

    expect(bestFigure().className).toContain('var(--ok)');
  });

  it('leaves an ungraded attempt neutral rather than failed', () => {
    // `passed` is null while an essay awaits grading. Red would be a verdict
    // nobody has reached yet.
    render(<QuizResultRow row={{ ...base, passed: null }} />);

    expect(bestFigure().className).not.toContain('var(--err)');
    expect(bestFigure().className).not.toContain('var(--ok)');
  });

  it('never colours the LATEST figure, even on a failed quiz', () => {
    // A lower recent score in red beside a green best would say "you failed"
    // about a quiz already passed — so `latest` carries no verdict at all.
    render(<QuizResultRow row={{ ...base, bestPercent: 90, passed: true }} />);

    const latest = screen.getAllByText('55%').find((el) => el.tagName === 'DD') as HTMLElement;
    expect(latest.className).not.toContain('var(--err)');
    expect(latest.className).not.toContain('var(--ok)');
  });
});
