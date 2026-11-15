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
  it('puts the average in the ring and says the low band as a way forward, not a fail', () => {
    const { container } = render(<ResultsHero summary={low} series={points} rows={rows} />);

    expect(container.querySelector('.rs-ring__num')?.textContent).toBe('18%');
    expect(container.querySelector('.rs-ring__arc')?.getAttribute('stroke-dasharray')).toBe('18 100');
    expect(container.querySelector('.rs-hero')?.getAttribute('data-band')).toBe('low');
    expect(container.querySelector('.rs-hero__mood')?.textContent).toBe(copy.results.moodLow);
  });

  it('keeps the two labels the e2e reads, once each', () => {
    render(<ResultsHero summary={low} series={points} rows={rows} />);

    expect(screen.getAllByText(copy.results.statQuizzes)).toHaveLength(1);
    expect(screen.getAllByText(copy.results.statAttempts)).toHaveLength(1);
  });

  it('draws one bar per sitting, oldest first, the newest marked and a failed paper red', () => {
    const { container } = render(<ResultsHero summary={low} series={points} rows={rows} />);

    const bars = [...container.querySelectorAll('.rs-bar')];
    expect(bars.map((bar) => bar.querySelector('b')?.textContent)).toEqual(['27', '12', '1']);
    expect(bars.map((bar) => bar.getAttribute('data-state'))).toEqual(['failed', 'failed', 'failed']);
    expect(bars.at(-1)?.hasAttribute('data-latest')).toBe(true);
    expect(bars[0]?.hasAttribute('data-latest')).toBe(false);
    // A 1% still draws a stub, not nothing.
    expect((bars.at(-1)?.querySelector('i') as HTMLElement).style.blockSize).toBe('4%');
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('27%، 12%، 1%');
  });

  it('keeps the bars to the last eight sittings', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ ...points[0]!, attemptId: `m${index}`, scorePercent: index }));
    const { container } = render(<ResultsHero summary={low} series={many} rows={rows} />);

    const bars = [...container.querySelectorAll('.rs-bar b')].map((b) => b.textContent);
    expect(bars).toEqual(['4', '5', '6', '7', '8', '9', '10', '11']);
  });

  it('celebrates a clean sheet at «امتياز» in the sentence', () => {
    const flat = points.map((p) => ({ ...p, scorePercent: 92, passed: true }));

    const { container } = render(
      <ResultsHero
        summary={{ ...low, averagePercent: 92, bestPercent: 95, passedCount: 3 }}
        series={flat}
        rows={rows}
      />,
    );
    expect(container.querySelector('.rs-hero')?.getAttribute('data-band')).toBe('high');
    expect(container.querySelector('.rs-hero__mood')?.textContent).toBe(copy.results.moodHigh);
  });

  it('warns that the average will move while an essay is still being marked', () => {
    render(
      <ResultsHero summary={low} series={points} rows={[...rows, { ...rows[0]!, lessonId: 'x', passed: null }]} />,
    );

    expect(screen.getByText(copy.results.pendingNote)).toBeTruthy();
  });

  it('says «لسه» in the ring rather than 0% when nothing is graded', () => {
    const { container } = render(
      <ResultsHero summary={{ ...low, averagePercent: null }} series={points} rows={rows} />,
    );

    expect(container.querySelector('.rs-ring__num')?.textContent).toBe(copy.results.noneYet);
    expect(container.querySelector('.rs-ring__arc')).toBeNull();
  });
});
