import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { practiceCopy as p } from '@ayman/contracts/copy/practice';
import type { PracticeSet } from '@/lib/practice/catalog';
import { PracticeRunner } from './practice-runner';

const SET: PracticeSet = {
  year: 2,
  lesson: '9-1',
  title: 'درس تجريبي',
  questions: [
    {
      id: 'a',
      type: 'mcq',
      stem: 'السؤال الأول؟',
      options: ['صح ده', 'غلط ١', 'غلط ٢', 'غلط ٣'],
      answer: 0,
      explanation: 'لأن الأول هو الصح.',
    },
    { id: 'b', type: 'tf', stem: 'العبارة دي غلط.', answer: 1, explanation: 'العبارة غلط فعلًا.' },
  ],
};

const renderRunner = () =>
  render(<PracticeRunner set={SET} articleHref="/news/x" courseHref="/courses/y" />);

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('<PracticeRunner>', () => {
  it('starts on an intro, so the prerendered page has no shuffled options in it', () => {
    renderRunner();
    expect(screen.queryByText('السؤال الأول؟')).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(p.run.start) })).toBeTruthy();
  });

  it('marks a wrong pick, shows the right answer and the explanation, then scores the attempt', () => {
    renderRunner();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(p.run.start) }));

    fireEvent.click(screen.getByRole('button', { name: /غلط ١/ }));
    expect(screen.getByText(p.run.wrong)).toBeTruthy();
    expect(screen.getByText('لأن الأول هو الصح.')).toBeTruthy();
    // Locked after the first pick — a second click cannot change the score.
    expect((screen.getByRole('button', { name: /صح ده/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(p.run.next) }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${p.run.false}`) }));
    expect(screen.getByText(p.run.correct)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(p.run.finish) }));
    expect(screen.getByText('1 من 2')).toBeTruthy();
    expect(screen.getByText(p.result.bands.review.label)).toBeTruthy();
    // The miss is listed for review, the hit is not.
    expect(screen.getByText('السؤال الأول؟')).toBeTruthy();
    expect(screen.queryByText('العبارة دي غلط.')).toBeNull();
    expect(JSON.parse(localStorage.getItem('practice:v1:2-9-1')!)).toEqual({ score: 1, total: 2 });
  });
});
