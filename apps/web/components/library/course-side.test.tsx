import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import { DEFAULT_BOOK_SHIPPING_RATES } from '@ayman/contracts/books';
import type { StudentExam } from '@ayman/contracts/quiz/scheduled';
import { CourseExamCard, CourseLinks } from './course-side';

const c = copy.library.side;

afterEach(cleanup);

const EXAM: StudentExam = {
  lessonId: '01a08666-ee40-71a9-9e33-f9fba6de63c1',
  courseId: '019fe000-0000-7000-8000-000000000001',
  courseTitle: 'البرمجة',
  courseSlug: 'cs',
  title: 'امتحان شهر نوفمبر',
  phase: 'open',
  openFrom: '2026-11-10T17:00:00.000Z',
  openUntil: '2026-11-20T17:00:00.000Z',
  keptOpen: false,
  durationSeconds: 2400,
  gradeOutOf: 20,
  coveredLessons: [],
  scaledScore: null,
  hasSat: false,
};

describe('CourseExamCard', () => {
  it('an open paper is the one orange press, into the quiz route', () => {
    const { container } = render(<CourseExamCard exam={EXAM} />);
    const go = screen.getByRole('link');
    expect(go.getAttribute('href')).toBe(`/quizzes/${EXAM.lessonId}`);
    expect(go.className).not.toContain('--quiet');
    expect(container.textContent).toContain('40 دقيقة');
  });

  it('an upcoming paper says when it opens and offers nothing to press', () => {
    render(<CourseExamCard exam={{ ...EXAM, phase: 'upcoming' }} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(new RegExp(c.examUpcoming))).toBeTruthy();
  });

  it('a paper already sat offers its result in the quiet weight', () => {
    render(<CourseExamCard exam={{ ...EXAM, hasSat: true }} />);
    const go = screen.getByRole('link', { name: c.examResult });
    expect(go.className).toContain('cp-exam__go--quiet');
  });
});

describe('CourseLinks', () => {
  it('draws the cohort group as a new-tab link and the book with its own order button', () => {
    const { container } = render(
      <CourseLinks
        groupUrl="https://chat.whatsapp.com/abc"
        book={{
          courseId: 'c-1',
          bookTitle: 'كتاب البرمجة',
          bookPriceCents: 15000,
          shippingRates: DEFAULT_BOOK_SHIPPING_RATES,
          instapay: null,
          vodafoneCash: null,
        }}
        certificates={null}
      />,
    );
    const group = container.querySelector<HTMLAnchorElement>('a.cp-link--group')!;
    expect(group.getAttribute('href')).toBe('https://chat.whatsapp.com/abc');
    expect(group.getAttribute('target')).toBe('_blank');
    expect(group.textContent).toContain(copy.player.group.title);
    expect(screen.getByRole('button', { name: copy.bookOrder.cta })).toBeTruthy();
    expect(container.textContent).toContain('150 جنيه');
  });

  it('renders no row at all when there is nothing behind any of them', () => {
    const { container } = render(<CourseLinks groupUrl={null} book={null} certificates={null} />);
    expect(container.querySelector('.cp-link')).toBeNull();
  });
});
