import { cleanup, render, screen } from '@testing-library/react';
import { copy, type CourseOutline } from '@ayman/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { CourseOutlineSidebar } from './course-outline';

afterEach(() => {
  cleanup();
});

/**
 * The tick in the player's sidebar, and the one row it refused to draw.
 *
 * A lecture quiz gets ONE sitting. A student who sat it and came in under the
 * pass mark has a grade, a result page and nothing left to do with that row —
 * and the tick stayed blank on it forever, because `isDone` asked whether the
 * lesson was CLEARED and `failed` is not a cleared state. Reported as «أنا
 * امتحنت أصلاً ومعايا الدرجة وكل حاجة، يبقى عليها علامة صح».
 *
 * The row now shares `/library/[slug]`'s own vocabulary (`.lesson-row`,
 * `isLessonFinished`) rather than a player-only tick icon, so "done" is read
 * off the row's own `lesson-row--done` class and the state word off its
 * (now VISIBLE, not `sr-only`) `.lesson-row__meta` line — see
 * `components/player/course-outline.tsx`.
 */
function lesson(over: Partial<CourseOutline['sections'][number]['lessons'][number]> = {}) {
  return {
    id: 'l1',
    title: 'الدرس',
    kind: 'video',
    position: 1,
    estimatedSeconds: 600,
    isFreePreview: false,
    state: 'not_started',
    completion: 0,
    gate: 'available',
    isExam: false,
    ...over,
  } as CourseOutline['sections'][number]['lessons'][number];
}

function outline(lessons: CourseOutline['sections'][number]['lessons']): CourseOutline {
  return {
    course: { id: 'c1', slug: 'course', title: 'الكورس', bookTitle: null, bookPriceCents: null },
    sections: [{ id: 's1', title: 'الوحدة', position: 1, lessons }],
    enrollmentId: 'e1',
    progressPercent: 50,
    lastLessonId: null,
    completedLessons: 1,
    totalLessons: lessons.length,
    examLessonId: null,
  } as CourseOutline;
}

function isDone(title: string): boolean {
  const row = screen.getByText(title).closest('li');
  return row?.classList.contains('lesson-row--done') ?? false;
}

/**
 * What the row says about the student — the `.lesson-row__meta` line, which
 * joins the state word in with the kind/duration/exam facts. `toContain` at
 * the call site, not equality: this reads the whole joined string.
 */
function stateWord(title: string): string {
  const row = screen.getByText(title).closest('li');
  return row?.querySelector('.lesson-row__meta')?.textContent ?? '';
}

describe('CourseOutlineSidebar — the tick', () => {
  it('ticks a lecture quiz that was sat and failed', () => {
    render(
      <CourseOutlineSidebar
        outline={outline([
          lesson({ id: 'l1', title: 'المحاضرة التانية', state: 'completed', gate: 'cleared' }),
          lesson({
            id: 'q1',
            title: 'كويز المحاضرة التانية',
            kind: 'quiz',
            position: 2,
            state: 'failed',
          }),
        ])}
        activeLessonId="l1"
        shippingCents={6500}
        vodafoneCash={null}
      />,
    );

    expect(isDone('كويز المحاضرة التانية')).toBe(true);
  });

  /**
   * ⚠️ This used to assert `text-transparent` — an invisible tick holding the
   * column open.
   *
   * That was survivable while the sidebar was a run of padlocks with one open
   * row at the front: the SHAPE of the list said where the student was. Every
   * lecture opens now (`gate-rule.ts`), so a forty-lesson course would be forty
   * identical blanks with nothing saying which had been watched — «بس ابقى
   * علّم عليها إن هو ما شافهاش». The blank is a visible ring, and the word
   * beside it is what a screen reader gets.
   */
  it('marks a quiz nobody has sat as not sat, rather than leaving it blank', () => {
    render(
      <CourseOutlineSidebar
        outline={outline([
          lesson({ id: 'l1', title: 'المحاضرة التانية', state: 'completed', gate: 'cleared' }),
          lesson({ id: 'q1', title: 'كويز لسه', kind: 'quiz', position: 2, state: 'not_started' }),
        ])}
        activeLessonId="l1"
        shippingCents={6500}
        vodafoneCash={null}
      />,
    );

    expect(isDone('كويز لسه')).toBe(false);
    // «ماشوفتهاش» is the wrong verb for a paper — you do not watch a quiz.
    expect(stateWord('كويز لسه')).toContain(copy.library.lessonQuizNew);
  });

  it('distinguishes a half-watched lecture from one never opened', () => {
    render(
      <CourseOutlineSidebar
        outline={outline([
          lesson({ id: 'l1', title: 'المحاضرة الأولى', state: 'in_progress' }),
          lesson({ id: 'l2', title: 'المحاضرة التانية', position: 2, state: 'not_started' }),
        ])}
        activeLessonId="l1"
        shippingCents={6500}
        vodafoneCash={null}
      />,
    );

    expect(stateWord('المحاضرة الأولى')).toContain(copy.library.lessonStarted);
    expect(stateWord('المحاضرة التانية')).toContain(copy.library.lessonNew);
  });

  it('leaves a FAILED exam unticked — an improvement sitting may still be open', () => {
    render(
      <CourseOutlineSidebar
        outline={outline([
          lesson({ id: 'l1', title: 'المحاضرة', state: 'completed', gate: 'cleared' }),
          lesson({
            id: 'ex',
            title: 'الامتحان النهائي',
            kind: 'quiz',
            position: 2,
            state: 'failed',
            isExam: true,
          }),
        ])}
        activeLessonId="l1"
        shippingCents={6500}
        vodafoneCash={null}
      />,
    );

    expect(isDone('الامتحان النهائي')).toBe(false);
  });
});

describe('CourseOutlineSidebar — the book CTA', () => {
  it('shows no book CTA when the course has no book configured', () => {
    render(
      <CourseOutlineSidebar
        outline={outline([lesson()])}
        activeLessonId="l1"
        shippingCents={6500}
        vodafoneCash="+201021196367"
      />,
    );
    expect(screen.queryByRole('button', { name: new RegExp(copy.bookOrder.cta) })).not.toBeInTheDocument();
  });

  it('shows the book CTA when the course has a book configured', () => {
    const withBook = outline([lesson()]);
    withBook.course = { ...withBook.course, bookTitle: 'كتاب البرمجة', bookPriceCents: 25000 };

    render(
      <CourseOutlineSidebar
        outline={withBook}
        activeLessonId="l1"
        shippingCents={6500}
        vodafoneCash="+201021196367"
      />,
    );
    expect(screen.getByRole('button', { name: new RegExp(copy.bookOrder.cta) })).toBeInTheDocument();
  });
});
