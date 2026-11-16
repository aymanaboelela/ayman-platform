import { cleanup, render, screen } from '@testing-library/react';
import { copy, type QuizHistoryRow } from '@ayman/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { ResultsList } from './results-list';

afterEach(() => {
  cleanup();
});

const row = (lessonId: string, passed: boolean | null, bestPercent = 60): QuizHistoryRow => ({
  lessonId,
  quizTitle: `امتحان ${lessonId}`,
  courseTitle: 'كورس',
  courseSlug: 'course',
  attemptsUsed: 1,
  allowsImprovement: false,
  improvementUsed: false,
  bestPercent,
  latestPercent: bestPercent,
  latestAttemptId: `${lessonId}-a`,
  passed,
  lastSubmittedAt: '2026-09-20T10:00:00.000Z',
});

describe('ResultsList', () => {
  it('offers a chip per verdict that is present, with counts, «الكل» checked', () => {
    const { container } = render(
      <ResultsList rows={[row('a', true), row('b', false), row('c', false)]} deltas={new Map()} showCourse={false} />,
    );

    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((radio) => radio.value)).toEqual(['all', 'passed', 'failed']);
    expect(radios[0]!.checked).toBe(true);
    const failed = container.querySelector('label[for="rs-f-failed"]');
    expect(failed?.textContent).toContain(copy.results.filterFailed);
    expect(failed?.textContent).toContain('2');
    expect(container.querySelector('label[for="rs-f-pending"]')).toBeNull();
  });

  it('draws no chips when every exam has the same verdict — one chip that hides nothing is clutter', () => {
    render(<ResultsList rows={[row('a', true), row('b', true)]} deltas={new Map()} showCourse={false} />);

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('tags every row with the chip it answers to, so the CSS can filter without script', () => {
    const { container } = render(
      <ResultsList rows={[row('a', true), row('b', false), row('c', null)]} deltas={new Map()} showCourse={false} />,
    );

    expect([...container.querySelectorAll('.rs-exam')].map((li) => li.getAttribute('data-filter'))).toEqual([
      'passed',
      'failed',
      'pending',
    ]);
  });
});
