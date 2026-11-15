import { cleanup, render, screen } from '@testing-library/react';
import { copy } from '@ayman/contracts/copy';
import { afterEach, describe, expect, it } from 'vitest';
import type { NextStep } from '@/lib/review-view';
import { ReviewActions, ReviewMistakes, ReviewStats } from './review-board';

afterEach(() => {
  cleanup();
});

const b = copy.quiz.reviewBoard;
const next: NextStep = { href: '/courses/python/lessons/lec-2', kind: 'video', title: 'المحاضرة التانية' };
const primaries = (container: HTMLElement) => container.querySelectorAll('.rvc-btn--primary');

describe('ReviewActions — one orange button, at most', () => {
  it('a pass: quiet «مراجعة الإجابات», orange «المحاضرة الجاية»', () => {
    const { container } = render(<ReviewActions primary={{ kind: 'next', step: next }} next={next} hasAnswers />);

    expect(primaries(container)).toHaveLength(1);
    expect(screen.getByRole('link', { name: b.nextLecture }).getAttribute('href')).toBe(next.href);
    expect(screen.getByRole('link', { name: b.nextLecture }).className).toContain('rvc-btn--primary');
    expect(screen.getByRole('link', { name: copy.quiz.reviewAnswers }).getAttribute('href')).toBe('#answers');
    expect(screen.getByRole('link', { name: copy.quiz.reviewAnswers }).className).toContain('rvc-btn--quiet');
  });

  it('names a quiz as «الامتحان الجاي», not a lecture', () => {
    render(<ReviewActions primary={{ kind: 'next', step: { ...next, kind: 'quiz' } }} next={next} hasAnswers />);
    expect(screen.getByRole('link', { name: b.nextQuiz })).toBeTruthy();
  });

  it('a fail with its improvement sitting open: that sitting is orange, and no third button', () => {
    const { container } = render(
      <ReviewActions primary={{ kind: 'improve', href: '/quizzes/q1' }} next={next} hasAnswers />,
    );

    expect(primaries(container)).toHaveLength(1);
    expect(screen.getByRole('link', { name: copy.quiz.improveExam }).getAttribute('href')).toBe('/quizzes/q1');
    expect(screen.queryByRole('link', { name: b.nextLecture })).toBeNull();
    expect(container.querySelectorAll('a')).toHaveLength(2);
  });

  it('nowhere to go next: reviewing the answers IS the next thing, in orange', () => {
    const { container } = render(<ReviewActions primary={{ kind: 'review' }} next={null} hasAnswers />);

    expect(primaries(container)).toHaveLength(1);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: copy.quiz.reviewAnswers }).className).toContain('rvc-btn--primary');
  });

  it('nothing at all to offer: a quiet way to «نتائجي», never an empty row', () => {
    render(<ReviewActions primary={null} next={null} hasAnswers={false} />);
    expect(screen.getByRole('link', { name: copy.results.title }).getAttribute('href')).toBe('/results');
  });
});

describe('ReviewStats', () => {
  it('shows «بتتصحّح» only while something is still being marked', () => {
    render(<ReviewStats tally={{ correct: 17, wrong: 3, pending: 0 }} />);
    expect(screen.getByText(b.statCorrect)).toBeTruthy();
    expect(screen.queryByText(b.statPending)).toBeNull();
    cleanup();

    render(<ReviewStats tally={{ correct: 17, wrong: 1, pending: 2 }} />);
    expect(screen.getByText(b.statPending)).toBeTruthy();
  });
});

describe('ReviewMistakes', () => {
  const row = (slotPosition: number) => ({ slotPosition, stem: `سؤال تجريبي ${slotPosition}`, picked: 'ب', right: 'د' });

  it('jumps each row to its own card in the paper below', () => {
    render(<ReviewMistakes rows={[row(3)]} />);

    expect(screen.getByRole('link', { name: new RegExp(b.solution) }).getAttribute('href')).toBe('#q-3');
    expect(screen.getByText('إجابتك: ب · الصح: د')).toBeTruthy();
  });

  it('shows five, then points at the rest', () => {
    render(<ReviewMistakes rows={[0, 1, 2, 3, 4, 5, 6].map(row)} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'و2 كمان في الإجابات تحت' }).getAttribute('href')).toBe('#answers');
  });

  it('renders nothing on a clean paper', () => {
    const { container } = render(<ReviewMistakes rows={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
