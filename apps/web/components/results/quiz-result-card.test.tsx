import { cleanup, render, screen, within } from '@testing-library/react';
import { copy, type QuizHistoryRow } from '@ayman/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { ImproveCard, QuizResultCard } from './quiz-result-card';

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
  lastSubmittedAt: '2026-08-14T10:00:00.000Z',
};

/** The two-sitting final exam, after its improvement sitting went worse. */
const improved: QuizHistoryRow = {
  ...base,
  attemptsUsed: 2,
  allowsImprovement: true,
  improvementUsed: true,
  bestPercent: 90,
  latestPercent: 55,
  passed: true,
};

const tile = (container: HTMLElement) => container.querySelector('.rs-score') as HTMLElement;

/**
 * The regression these pin down is a SCORE THAT LOOKS PASSED.
 *
 * The card used to colour its score on `percent >= 50`, and 50 is not a pass
 * mark anywhere on this platform — each quiz carries its own `passPercent`,
 * and production's foundation exam uses 70. So every score from 50 to 69
 * printed green here while `passed` was false and every other screen said
 * otherwise. 55 is the fixture above for exactly that reason: under the old
 * rule it is green, under the correct one it is red.
 */
describe('QuizResultCard — the verdict colour', () => {
  it('tiles a 55% best as BAD when the quiz says it failed', () => {
    const { container } = render(<QuizResultCard row={base} />);

    expect(tile(container).getAttribute('data-tone')).toBe('bad');
    expect(tile(container).textContent).toBe('55%');
  });

  it('tiles the same 55% as good when the quiz’s own mark is lower', () => {
    const { container } = render(<QuizResultCard row={{ ...base, passed: true }} />);

    expect(tile(container).getAttribute('data-tone')).toBe('good');
  });

  it('leaves an ungraded attempt amber rather than failed', () => {
    // `passed` is null while an essay awaits grading. Red would be a verdict
    // nobody has reached yet.
    const { container } = render(<QuizResultCard row={{ ...base, passed: null }} />);

    expect(tile(container).getAttribute('data-tone')).toBe('warn');
    expect(container.querySelector('.rs-exam')?.getAttribute('data-verdict')).toBe('pending');
    expect(container.querySelector('.rs-exam')?.getAttribute('data-filter')).toBe('pending');
    expect(screen.getByText(copy.quiz.pendingNotFinal)).toBeTruthy();
  });

  it('tiles the BEST sitting, never the latest', () => {
    const { container } = render(<QuizResultCard row={improved} />);

    expect(tile(container).textContent).toBe('90%');
    expect(tile(container).getAttribute('data-tone')).toBe('good');
  });
});

describe('QuizResultCard — what it shows', () => {
  it('prints «latest» only when there was a second sitting', () => {
    // One sitting: best and latest are the same attempt, and two identical
    // figures side by side read as two results.
    const { container } = render(<QuizResultCard row={base} />);
    expect(container.querySelector('.rs-exam__latest')).toBeNull();
    cleanup();

    const second = render(<QuizResultCard row={improved} />);
    expect(second.container.querySelector('.rs-exam__latest')?.textContent).toContain('55%');
  });

  it('marks a pass at the «امتياز» line with its own badge, and a plain pass without', () => {
    const { container } = render(<QuizResultCard row={{ ...base, bestPercent: 92, passed: true }} />);
    expect(screen.getByText(copy.results.verdictExcellent)).toBeTruthy();
    expect(container.querySelector('.rs-exam')?.getAttribute('data-verdict')).toBe('excellent');
    expect(container.querySelector('.rs-exam')?.getAttribute('data-filter')).toBe('passed');
    cleanup();

    render(<QuizResultCard row={{ ...base, bestPercent: 75, passed: true }} />);
    expect(screen.queryByText(copy.results.verdictExcellent)).toBeNull();
    expect(screen.getByText(copy.results.verdictPassed)).toBeTruthy();
  });

  it('says a fall in words to a screen reader, and does not paint it red', () => {
    const { container } = render(<QuizResultCard row={improved} delta={-35} />);

    const delta = container.querySelector('.rs-delta') as HTMLElement;
    expect(delta.getAttribute('data-direction')).toBe('down');
    expect(within(delta).getByText(/أقل بـ35%/)).toBeTruthy();
  });

  it('says a rise as a rise', () => {
    const { container } = render(
      <QuizResultCard row={{ ...improved, latestPercent: 90 }} delta={35} />,
    );

    const delta = container.querySelector('.rs-delta') as HTMLElement;
    expect(delta.getAttribute('data-direction')).toBe('up');
    expect(within(delta).getByText(/أعلى بـ35%/)).toBeTruthy();
  });

  it('always links to the review of the latest attempt, named for the exam', () => {
    render(<QuizResultCard row={base} />);

    // The e2e finds it by «مراجعة الإجابات»; the visible word is the short «مراجعة».
    const review = screen.getByRole('link', { name: new RegExp(copy.quiz.reviewAnswers) });
    expect(review.getAttribute('href')).toBe(
      `/quizzes/${base.lessonId}/attempt/${base.latestAttemptId}/review`,
    );
    expect(review.getAttribute('aria-label')).toContain(base.quizTitle);
    expect(review.textContent).toBe(copy.results.reviewShort);
    expect(review.className).toContain('rs-btn--quiet');
  });

  it('says the improvement sitting is open, but leaves the button to the card above', () => {
    render(<QuizResultCard row={{ ...base, allowsImprovement: true, improvementUsed: false }} />);
    expect(screen.getByText(copy.results.improveOpen)).toBeTruthy();
    expect(screen.queryByRole('link', { name: copy.quiz.improveExam })).toBeNull();
    cleanup();

    render(<QuizResultCard row={improved} />);
    expect(screen.queryByText(copy.results.improveOpen)).toBeNull();
  });

  it('dates an exam in Cairo time, not the server’s', () => {
    // 23:30 UTC on the 13th is 02:30 on the 14th in Cairo — the day the
    // student actually sat it.
    render(<QuizResultCard row={{ ...base, lastSubmittedAt: '2026-08-13T23:30:00.000Z' }} />);

    expect(screen.getByText('14 أغسطس')).toBeTruthy();
  });

  it('names the course only when asked to', () => {
    render(<QuizResultCard row={base} showCourse />);
    expect(screen.getByText(base.courseTitle)).toBeTruthy();
    cleanup();

    render(<QuizResultCard row={base} />);
    expect(screen.queryByText(base.courseTitle)).toBeNull();
  });
});

describe('ImproveCard', () => {
  it('carries the one orange button, to the quiz’s intro page — never straight into a sitting', () => {
    render(<ImproveCard row={{ ...base, allowsImprovement: true }} />);

    const cta = screen.getByRole('link', { name: copy.quiz.improveExam });
    expect(cta.getAttribute('href')).toBe(`/quizzes/${base.lessonId}`);
    expect(cta.className).toContain('rs-btn--primary');
    expect(screen.getByText(copy.results.improveBadge)).toBeTruthy();
    expect(screen.getByRole('heading', { name: base.quizTitle })).toBeTruthy();
  });
});
