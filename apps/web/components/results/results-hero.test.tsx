import { cleanup, render, screen } from '@testing-library/react';
import { copy, type QuizHistoryPoint, type QuizHistoryRow } from '@ayman/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { ResultsHero } from './results-hero';

afterEach(() => {
  cleanup();
});

const points: QuizHistoryPoint[] = [27, 12, 1].map((scorePercent, index) => ({
  attemptId: `a${index}`,
  lessonId: `l${index}`,
  quizTitle: `كويز ${index}`,
  attemptNo: 1,
  scorePercent,
  passed: false,
  submittedAt: `2026-09-2${index}T10:00:00.000Z`,
}));

const rows: QuizHistoryRow[] = points.map((p) => ({
  lessonId: p.lessonId,
  quizTitle: p.quizTitle,
  courseTitle: 'كورس',
  courseSlug: 'course',
  attemptsUsed: 1,
  allowsImprovement: false,
  improvementUsed: false,
  bestPercent: p.scorePercent,
  latestPercent: p.scorePercent,
  latestAttemptId: p.attemptId,
  passed: false,
  lastSubmittedAt: p.submittedAt,
}));

/** The owner's screenshot: three exams, three attempts, 18% average, none passed. */
const low = { quizzesTaken: 3, attemptsTotal: 3, averagePercent: 18, bestPercent: 27, passedCount: 0 };

describe('ResultsHero', () => {
  it('puts the average on the gauge and names its band without calling it a fail', () => {
    const { container } = render(<ResultsHero summary={low} series={points} rows={rows} />);

    expect(container.querySelector('.rs-gauge__num')?.textContent).toBe('18');
    expect(container.querySelector('.rs-hero')?.getAttribute('data-band')).toBe('low');
    expect(screen.getByText(copy.results.bandLow)).toBeTruthy();
    expect(container.querySelector('.rs-hero__mood')?.textContent).toBe(copy.results.moodLow);
  });

  it('keeps the two labels the e2e reads, once each', () => {
    render(<ResultsHero summary={low} series={points} rows={rows} />);

    expect(screen.getAllByText(copy.results.statQuizzes)).toHaveLength(1);
    expect(screen.getAllByText(copy.results.statAttempts)).toHaveLength(1);
  });

  it('shows passed-of-sat as figures, pips and a sentence a screen reader can say', () => {
    const { container } = render(<ResultsHero summary={low} series={points} rows={rows} />);

    expect(container.querySelectorAll('.rs-pips i')).toHaveLength(3);
    expect(container.querySelectorAll('.rs-pips i[data-on]')).toHaveLength(0);
    expect(screen.getByText('0 من 3')).toBeTruthy();
  });

  it('switches to «امتياز» at 90, and celebrates a clean sheet over the plain pass line', () => {
    const flat = points.map((p) => ({ ...p, scorePercent: 92, passed: true }));

    const { container } = render(
      <ResultsHero
        summary={{ ...low, averagePercent: 92, bestPercent: 95, passedCount: 3 }}
        series={flat}
        rows={rows}
      />,
    );
    expect(screen.getByText(copy.results.bandHigh)).toBeTruthy();
    expect(container.querySelector('.rs-hero__mood')?.textContent).toBe(copy.results.moodHigh);
  });

  it('warns that the average will move while an essay is still being marked', () => {
    render(
      <ResultsHero summary={low} series={points} rows={[...rows, { ...rows[0]!, lessonId: 'x', passed: null }]} />,
    );

    expect(screen.getByText(copy.results.pendingNote)).toBeTruthy();
  });

  it('shows a bar instead of pips once they can no longer be counted', () => {
    const { container } = render(
      <ResultsHero summary={{ ...low, quizzesTaken: 20, passedCount: 5 }} series={points} rows={rows} />,
    );

    expect(container.querySelector('.rs-pips')).toBeNull();
    expect(container.querySelector<HTMLElement>('.rs-meter i')?.style.inlineSize).toBe('25%');
  });
});
