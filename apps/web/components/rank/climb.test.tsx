import { cleanup, render, screen, within } from '@testing-library/react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { CohortRank } from '@ayman/contracts/rank';
import type { RankNextHomework, RankNextQuiz, RankNextSteps } from '@ayman/contracts/rank-next';
import { afterEach, describe, expect, it } from 'vitest';
import { Climb } from './climb';

afterEach(() => {
  cleanup();
});

const c = copy.rank;

const rank = (homework: { submitted: number; owed: number } = { submitted: 0, owed: 0 }): CohortRank => ({
  cohort: { label: '' },
  me: {
    rank: 3,
    points: 120,
    betterThanPercent: 50,
    average: 70,
    quizzes: { count: 1, average: 70, fullMarks: 0 },
    exams: { count: 0, average: null, fullMarks: 0 },
    homework: { ...homework, accepted: 0 },
    pendingReview: 0,
  },
  pointsToNextRank: 10,
  podium: [],
  ladder: [],
  computedAt: new Date().toISOString(),
});

const id = (n: number) => `0199c000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const hw = (n: number, status: RankNextHomework['status'] = 'new'): RankNextHomework => ({
  lessonId: id(n),
  lessonTitle: `المحاضرة ${n}`,
  courseSlug: 'prog-2',
  courseTitle: 'البرمجة',
  status,
});

const quiz = (n: number, state: RankNextQuiz['state'], bestPercent: number | null = null): RankNextQuiz => ({
  lessonId: id(100 + n),
  title: `كويز ${n}`,
  courseSlug: 'prog-2',
  courseTitle: 'البرمجة',
  state,
  bestPercent,
});

const steps = (overrides: Partial<RankNextSteps> = {}): RankNextSteps => ({
  homework: { items: [], total: 0, locked: null },
  quizzes: { items: [], total: 0, actionable: 0, locked: null },
  exams: { next: null, last: null },
  ...overrides,
});

const card = (container: HTMLElement, kind: string) => container.querySelector<HTMLElement>(`.rk-tip[data-kind='${kind}']`)!;

describe('Climb — «الطريق لفوق» بيودّي على اللي ناقص', () => {
  it('each pending homework opens that lecture’s homework, and the count strip opens the first', () => {
    const items = [hw(3, 'needs_work'), hw(1), hw(2), hw(4), hw(5)];
    const { container } = render(
      <Climb data={rank()} steps={steps({ homework: { items, total: 5, locked: null } })} />,
    );
    const homework = within(card(container, 'homework'));

    const strip = homework.getByRole('link', { name: formatCopy(c.climbHomeworkOwed, { count: 5 }) });
    expect(strip.getAttribute('href')).toBe(`/courses/prog-2/lessons/${id(3)}#homework`);

    const links = homework.getAllByRole('link').filter((a) => a.classList.contains('rk-step'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      items.map((row) => `/courses/prog-2/lessons/${row.lessonId}#homework`),
    );
    // Three in view, the rest behind «وكمان ٢».
    expect(container.querySelectorAll(".rk-tip[data-kind='homework'] details .rk-step")).toHaveLength(2);
    expect(homework.getByText(formatCopy(c.climbMore, { count: 2 }))).toBeTruthy();
    expect(homework.getByText(c.climbHomeworkRedo)).toBeTruthy();
  });

  it('a quiz row says its best score and whether there is another sitting, and links to the quiz', () => {
    const { container } = render(
      <Climb
        data={rank()}
        steps={steps({
          quizzes: { items: [quiz(1, 'new'), quiz(2, 'spent', 70)], total: 2, actionable: 1, locked: null },
        })}
      />,
    );
    const quizzes = within(card(container, 'quiz'));

    expect(quizzes.getByRole('link', { name: formatCopy(c.climbQuizOwed, { count: 1 }) }).getAttribute('href')).toBe(
      `/quizzes/${id(101)}`,
    );
    const spent = quizzes.getByRole('link', { name: /كويز 2/ });
    expect(spent.getAttribute('href')).toBe(`/quizzes/${id(102)}`);
    expect(spent.textContent).toContain('70%');
    expect(spent.textContent).toContain(c.climbQuizSpent);
    // The number is isolated so «70%» cannot flip inside the Arabic line.
    expect(spent.querySelector('.rk-num')?.textContent).toBe('70%');
  });

  it('an empty card celebrates instead of leaving a gap', () => {
    const { container } = render(<Climb data={rank({ submitted: 4, owed: 4 })} steps={steps()} />);
    expect(within(card(container, 'homework')).getByText(c.climbHomeworkDone)).toBeTruthy();
    expect(within(card(container, 'quiz')).getByText(c.climbQuizDone)).toBeTruthy();
    expect(within(card(container, 'exam')).getByText(c.climbExamNotYet)).toBeTruthy();
  });

  it('…but never congratulates a student who has done nothing yet', () => {
    const data = rank();
    data.me.quizzes = { count: 0, average: null, fullMarks: 0 };
    const { container } = render(<Climb data={data} steps={steps()} />);
    expect(within(card(container, 'homework')).getByText(c.climbHomeworkNone)).toBeTruthy();
    expect(within(card(container, 'quiz')).getByText(c.climbQuizNone)).toBeTruthy();
    expect(container.querySelector('.rk-done:not([data-quiet])')).toBeNull();
  });

  it('what a subscription locks is one line with the door, never a row', () => {
    const { container } = render(
      <Climb
        data={rank()}
        steps={steps({ homework: { items: [hw(1)], total: 1, locked: { count: 3, courseSlug: 'prog-2' } } })}
      />,
    );
    const door = within(card(container, 'homework')).getByRole('link', { name: /تفاصيل الاشتراك/ });
    expect(door.getAttribute('href')).toBe('/library/prog-2');
    expect(door.textContent).toContain(formatCopy(c.climbLocked, { count: 3 }));
  });

  it('the next monthly exam is one big link, open now', () => {
    const { container } = render(
      <Climb
        data={rank()}
        steps={steps({
          exams: {
            next: {
              lessonId: id(200),
              title: 'امتحان شهر أكتوبر',
              courseSlug: 'prog-2',
              courseTitle: 'البرمجة',
              phase: 'open',
              openFrom: '2026-09-29T17:00:00.000Z',
              openUntil: '2026-10-02T17:00:00.000Z',
              state: 'new',
              bestPercent: null,
            },
            last: null,
          },
        })}
      />,
    );
    const exam = within(card(container, 'exam')).getByRole('link', { name: /امتحان شهر أكتوبر/ });
    expect(exam.getAttribute('href')).toBe(`/quizzes/${id(200)}`);
    expect(exam.textContent).toContain(c.climbExamOpen);
    expect(exam.textContent).toContain(c.climbExamOpenCta);
  });

  it('without the steps (the read failed) the cards fall back to the old count, unlinked', () => {
    const { container } = render(<Climb data={rank({ submitted: 2, owed: 9 })} steps={null} />);
    const homework = within(card(container, 'homework'));
    expect(homework.getByText(formatCopy(c.climbHomeworkOwed, { count: 7 }))).toBeTruthy();
    expect(homework.queryAllByRole('link')).toHaveLength(0);
    // The section's own way to the path is still there.
    expect(screen.getByRole('link', { name: new RegExp(c.climbCta) }).getAttribute('href')).toBe('/path');
  });
});
