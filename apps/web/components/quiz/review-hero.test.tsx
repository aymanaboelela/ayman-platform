import { cleanup, render, screen } from '@testing-library/react';
import { copy } from '@ayman/contracts/copy';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewHero, type ReviewHeroProps } from './review-hero';

afterEach(() => {
  cleanup();
});

const b = copy.quiz.reviewBoard;

const passed: ReviewHeroProps = {
  scaledScore: 17,
  gradeOutOf: 20,
  passPercent: 50,
  passed: true,
  needsGrading: false,
  pendingOutOf: 0,
  gradedOutOf: 20,
  title: 'امتحان نص شهر سبتمبر',
};

describe('ReviewHero', () => {
  it('celebrates a pass: confetti, the ring, «نجاح» and «برافو!» with the quiz’s name', () => {
    const { container } = render(<ReviewHero {...passed} />);

    expect(container.querySelector('.rvc-hero')?.getAttribute('data-band')).toBe('pass');
    expect(container.querySelector('.rvc-confetti')).not.toBeNull();
    expect(container.querySelector('.rvc-ring__pct')?.textContent).toBe('85%');
    expect(container.querySelector('.rvc-ring__arc')?.getAttribute('stroke-dasharray')).toBe('85 100');
    expect(screen.getByText(copy.quiz.passed)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(`${b.passedTitle} ${passed.title}`);
    expect(screen.getByText(b.passedLine)).toBeTruthy();
  });

  it('keeps «نتيجتك» as the eyebrow, once — the e2e reads it', () => {
    render(<ReviewHero {...passed} />);
    expect(screen.getAllByText(copy.quiz.resultsTitle)).toHaveLength(1);
  });

  it('is calm under the line: no confetti, an amber ring, and what to do next', () => {
    const { container } = render(<ReviewHero {...passed} scaledScore={6} passed={false} />);

    expect(container.querySelector('.rvc-hero')?.getAttribute('data-band')).toBe('low');
    expect(container.querySelector('.rvc-confetti')).toBeNull();
    expect(screen.getByText(copy.quiz.failed)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(b.lowTitle);
    expect(screen.getByText(passed.title!)).toBeTruthy();
    expect(screen.getByText(b.lowLine)).toBeTruthy();
  });

  it('gives no verdict and no pass line while essays are with the instructor', () => {
    const { container } = render(
      <ReviewHero {...passed} scaledScore={45} gradeOutOf={100} gradedOutOf={50} pendingOutOf={50} needsGrading />,
    );

    expect(container.querySelector('.rvc-hero')?.getAttribute('data-band')).toBe('pending');
    expect(container.querySelector('.rvc-confetti')).toBeNull();
    // Over the marked half, never over the paper's whole total.
    expect(container.querySelector('.rvc-ring__pct')?.textContent).toBe('90%');
    expect(screen.getByText(copy.quiz.pendingEyebrow)).toBeTruthy();
    expect(screen.getByText(copy.quiz.pendingNotFinal)).toBeTruthy();
    expect(screen.queryByText(copy.quiz.passed)).toBeNull();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(quizExperience.result.bands.pending.title);
    expect(screen.getByText(copy.quiz.pendingWillArrive)).toBeTruthy();
    expect(container.textContent).not.toContain('درجة النجاح');
  });

  it('still celebrates without a title — the history read is allowed to fail', () => {
    render(<ReviewHero {...passed} title={null} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(b.passedTitle);
  });
});
