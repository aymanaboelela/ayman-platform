import { cleanup, render, screen, within } from '@testing-library/react';
import { copy, type QuizHistoryRow } from '@ayman/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { QuizResultCard } from './quiz-result-card';

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

const figure = (label: string) => {
  const term = screen.queryAllByText(label).find((el) => el.tagName === 'DT');
  return (term?.nextElementSibling as HTMLElement | null | undefined) ?? null;
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
describe('QuizResultCard — the verdict colour', () => {
  it('colours a 55% best as FAILED when the quiz says so', () => {
    render(<QuizResultCard row={base} />);

    expect(figure(copy.results.best)!.className).toContain('var(--err)');
    expect(figure(copy.results.best)!.className).not.toContain('var(--ok)');
  });

  it('colours the same 55% as passed when the quiz’s own mark is lower', () => {
    render(<QuizResultCard row={{ ...base, passed: true }} />);

    expect(figure(copy.results.best)!.className).toContain('var(--ok)');
  });

  it('leaves an ungraded attempt neutral rather than failed', () => {
    // `passed` is null while an essay awaits grading. Red would be a verdict
    // nobody has reached yet.
    const { container } = render(<QuizResultCard row={{ ...base, passed: null }} />);

    expect(figure(copy.results.best)!.className).not.toContain('var(--err)');
    expect(figure(copy.results.best)!.className).not.toContain('var(--ok)');
    expect(container.querySelector('.rs-exam')?.getAttribute('data-verdict')).toBe('pending');
    expect(screen.getByText(copy.quiz.pendingNotFinal)).toBeTruthy();
  });

  it('never colours the LATEST figure, even on a failed quiz', () => {
    // A lower recent score in red beside a green best would say "you failed"
    // about a quiz already passed — so `latest` carries no verdict at all.
    render(<QuizResultCard row={improved} />);

    const latest = figure(copy.results.latest)!;
    expect(latest.textContent).toContain('55%');
    expect(latest.className).not.toContain('var(--err)');
    expect(latest.className).not.toContain('var(--ok)');
  });
});

describe('QuizResultCard — what it shows', () => {
  it('prints «latest» only when there was a second sitting', () => {
    // One sitting: best and latest are the same attempt, and two identical
    // figures side by side read as two results.
    render(<QuizResultCard row={base} />);
    expect(figure(copy.results.latest)).toBeNull();
    cleanup();

    render(<QuizResultCard row={improved} />);
    expect(figure(copy.results.latest)).not.toBeNull();
  });

  it('marks a pass at the «امتياز» line with its own badge, and a plain pass without', () => {
    const { container } = render(<QuizResultCard row={{ ...base, bestPercent: 92, passed: true }} />);
    expect(screen.getByText(copy.results.verdictExcellent)).toBeTruthy();
    expect(container.querySelector('.rs-exam')?.getAttribute('data-verdict')).toBe('excellent');
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

  it('always links to the review of the latest attempt', () => {
    render(<QuizResultCard row={base} />);

    const review = screen.getByRole('link', { name: copy.quiz.reviewAnswers });
    expect(review.getAttribute('href')).toBe(
      `/quizzes/${base.lessonId}/attempt/${base.latestAttemptId}/review`,
    );
  });

  it('makes review the loud button only when it is the one thing left to do', () => {
    // A failed paper with no second sitting: review IS the way forward.
    render(<QuizResultCard row={base} />);
    expect(screen.getByRole('link', { name: copy.quiz.reviewAnswers }).className).toContain('chip--solid');
    cleanup();

    // A passed one: review is optional, so it steps back.
    render(<QuizResultCard row={{ ...base, passed: true }} />);
    expect(screen.getByRole('link', { name: copy.quiz.reviewAnswers }).className).toContain('chip--accent');
    cleanup();

    // A failed one with the improvement sitting open: that sitting is the loud one.
    render(<QuizResultCard row={{ ...base, allowsImprovement: true }} />);
    expect(screen.getByRole('link', { name: copy.quiz.reviewAnswers }).className).toContain('chip--accent');
    expect(screen.getByRole('link', { name: copy.quiz.improveExam }).className).toContain('chip--solid');
  });

  it('offers the improvement sitting only while it is unused', () => {
    render(<QuizResultCard row={{ ...base, allowsImprovement: true, improvementUsed: false }} />);
    expect(screen.getByRole('link', { name: copy.quiz.improveExam }).getAttribute('href')).toBe(
      `/quizzes/${base.lessonId}`,
    );
    expect(screen.getByText(copy.results.improveOpen)).toBeTruthy();
    cleanup();

    render(<QuizResultCard row={improved} />);
    expect(screen.queryByRole('link', { name: copy.quiz.improveExam })).toBeNull();
  });

  it('dates a spent exam in Cairo time, not the server’s', () => {
    // 23:30 UTC on the 13th is 02:30 on the 14th in Cairo — the day the
    // student actually sat it.
    render(<QuizResultCard row={{ ...base, lastSubmittedAt: '2026-08-13T23:30:00.000Z' }} />);

    expect(screen.getByText(/اتقدّم 14 أغسطس/)).toBeTruthy();
  });

  it('names the course only when asked to', () => {
    render(<QuizResultCard row={base} showCourse />);
    expect(screen.getByText(base.courseTitle)).toBeTruthy();
    cleanup();

    render(<QuizResultCard row={base} />);
    expect(screen.queryByText(base.courseTitle)).toBeNull();
  });
});
