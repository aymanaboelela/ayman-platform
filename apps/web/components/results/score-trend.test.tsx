import { cleanup, render, screen } from '@testing-library/react';
import { copy, type QuizHistoryPoint } from '@ayman/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { projectSeries } from '@/lib/quiz-history-view';
import { ScoreTrend, datedIndexes, labelledIndexes } from './score-trend';

afterEach(() => {
  cleanup();
});

function point(overrides: Partial<QuizHistoryPoint> = {}): QuizHistoryPoint {
  return {
    attemptId: 'a1',
    lessonId: 'l1',
    quizTitle: 'كويز الدوال',
    attemptNo: 1,
    scorePercent: 27,
    passed: false,
    submittedAt: '2026-09-24T10:00:00.000Z',
    ...overrides,
  };
}

const three = [
  point({ attemptId: 'a1', scorePercent: 27, submittedAt: '2026-09-24T10:00:00.000Z' }),
  point({ attemptId: 'a2', scorePercent: 12, submittedAt: '2026-09-26T10:00:00.000Z' }),
  point({ attemptId: 'a3', scorePercent: 1, submittedAt: '2026-09-28T10:00:00.000Z' }),
];

describe('ScoreTrend', () => {
  it('prints every point’s score and date when there are only a few', () => {
    const { container } = render(<ScoreTrend series={three} />);

    const labels = [...container.querySelectorAll('.rs-dot__label')].map((el) => el.textContent);
    expect(labels).toEqual(['27%', '12%', '1%']);
    const dates = [...container.querySelectorAll('.rs-trend__date')].map((el) => el.textContent);
    expect(dates).toEqual(['24 سبتمبر', '26 سبتمبر', '28 سبتمبر']);
  });

  it('draws the oldest point at the RIGHT — inline-start in an RTL page', () => {
    const { container } = render(<ScoreTrend series={three} />);

    const dots = [...container.querySelectorAll<HTMLElement>('.rs-dot')];
    const starts = dots.map((dot) => parseFloat(dot.style.insetInlineStart));
    expect(starts[0]).toBeLessThan(starts[1]!);
    expect(starts[1]).toBeLessThan(starts[2]!);
  });

  it('still renders one attempt — a labelled point and a sentence, no line', () => {
    const { container } = render(<ScoreTrend series={[point({ scorePercent: 64 })]} />);

    expect(container.querySelectorAll('.rs-dot')).toHaveLength(1);
    expect(container.querySelector('polyline')).toBeNull();
    expect(screen.getByText(copy.results.trendSingle)).toBeTruthy();
    expect(container.querySelector('.rs-trend__caption')?.textContent).toBe(
      'محاولة واحدة لحد دلوقتي، درجتها 64%.',
    );
  });

  it('says what it shows in text: the caption, and one line per attempt', () => {
    const { container } = render(<ScoreTrend series={three} />);

    const caption = container.querySelector('figcaption')!;
    expect(caption.textContent).toBe('رسم بياني لـ3 محاولة، من 27% لحد 1%.');
    // Every figure isolated, so «27%» cannot render as «%27» in the RTL line.
    expect([...caption.querySelectorAll('.rs-ltr')].map((el) => el.textContent)).toEqual([
      '3',
      '27%',
      '1%',
    ]);
    const lines = screen.getAllByRole('listitem').filter((li) => li.closest('ol'));
    expect(lines).toHaveLength(3);
    expect(lines[0]!.textContent).toBe(`كويز الدوال: 27%، ${copy.results.trendLegendFailed}، 24 سبتمبر`);
  });

  it('keys only the states it actually drew', () => {
    render(<ScoreTrend series={three} />);

    expect(screen.getByText(copy.results.trendLegendFailed)).toBeTruthy();
    expect(screen.queryByText(copy.results.trendLegendPassed)).toBeNull();
    expect(screen.queryByText(copy.results.trendLegendPending)).toBeNull();
  });

  it('hides the drawing from assistive tech — the text carries it', () => {
    const { container } = render(<ScoreTrend series={three} />);

    expect(container.querySelector('.rs-trend__plot')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('labelledIndexes', () => {
  it('labels only the start, the end and the two extremes of a long series', () => {
    const series = Array.from({ length: 12 }, (_, index) =>
      point({ attemptId: `a${index}`, scorePercent: index === 4 ? 99 : index === 7 ? 2 : 50 }),
    );

    expect([...labelledIndexes(projectSeries(series))].sort((a, b) => a - b)).toEqual([0, 4, 7, 11]);
  });
});

describe('datedIndexes', () => {
  it('dates every point while they fit, then only the two ends', () => {
    expect([...datedIndexes(3)]).toEqual([0, 1, 2]);
    expect([...datedIndexes(9)]).toEqual([0, 8]);
  });
});
