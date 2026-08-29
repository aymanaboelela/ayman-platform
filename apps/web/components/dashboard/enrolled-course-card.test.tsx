import { cleanup, render, screen } from '@testing-library/react';
import { copy, type EnrolledCourse } from '@ayman/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { EnrolledCourseCard } from './enrolled-course-card';

// Explicit, as every component test in this repo does it — `vitest.setup.ts`
// registers no automatic cleanup, so without this each `render` leaves its
// tree in the document and `getByText` starts finding two of everything.
afterEach(() => {
  cleanup();
});

const base: EnrolledCourse = {
  id: '0198c3a2-0000-7000-8000-000000000001',
  slug: 'cs-y2',
  title: 'البرمجة وعلوم الحاسب',
  coverKey: null,
  subjectNameAr: 'البرمجة',
  published: true,
  progressPercent: 40,
  completedLessons: 2,
  totalLessons: 5,
  lastLessonId: '0198c3a2-0000-7000-8000-000000000002',
  subscriptionValidUntil: null,
  comingSoonNote: null,
  bookTitle: null,
  bookPriceCents: null,
};

/**
 * `EnrolledCourseCard`'s own «اطلب الكتاب» CTA — the dashboard-side entry
 * point into the SAME `BookOrderButton`/`BookOrderPanel` flow the public
 * course page already ships, for a student who is already enrolled and may
 * never visit that page again. Gated on the exact pair the public page
 * already uses (`bookTitle`/`bookPriceCents` both non-null), and additionally
 * hidden while the course is closed — `BookOrdersService.create` 404s on
 * anything but a published course, so showing the button there would only
 * ever fail.
 */
describe('EnrolledCourseCard — book CTA', () => {
  it('shows no book CTA when the course has no book configured', () => {
    render(<EnrolledCourseCard course={base} vodafoneCash="+201021196367" />);
    expect(screen.queryByRole('button', { name: new RegExp(copy.bookOrder.cta) })).not.toBeInTheDocument();
  });

  it('shows the book CTA when the course has a book configured', () => {
    render(
      <EnrolledCourseCard
        course={{ ...base, bookTitle: 'كتاب البرمجة', bookPriceCents: 25000 }}
        vodafoneCash="+201021196367"
      />,
    );
    expect(screen.getByRole('button', { name: new RegExp(copy.bookOrder.cta) })).toBeInTheDocument();
  });

  it('hides the book CTA on a closed course even with a book configured', () => {
    // A course the instructor took down to edit — `BookOrdersService.create`
    // 404s on anything but a published course, so a button here would only
    // ever fail.
    render(
      <EnrolledCourseCard
        course={{ ...base, published: false, bookTitle: 'كتاب البرمجة', bookPriceCents: 25000 }}
        vodafoneCash="+201021196367"
      />,
    );
    expect(screen.queryByRole('button', { name: new RegExp(copy.bookOrder.cta) })).not.toBeInTheDocument();
  });
});
