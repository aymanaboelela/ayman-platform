import { cleanup, render, screen } from '@testing-library/react';
import { copy, type CourseOutline } from '@ayman/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { CourseOutlineSidebar } from './course-outline';

afterEach(() => {
  cleanup();
});

const u = copy.player.units;
const c = copy.library;

type Lesson = CourseOutline['sections'][number]['lessons'][number];
type Section = CourseOutline['sections'][number];

function lesson(over: Partial<Lesson> = {}): Lesson {
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
    month: null,
    ...over,
  } as Lesson;
}

function section(id: string, title: string, lessons: Lesson[], over: Partial<Section> = {}): Section {
  return { id, title, position: 1, coverKey: null, lessons, ...over } as Section;
}

function outline(sections: Section[], over: Partial<CourseOutline> = {}): CourseOutline {
  const lessons = sections.flatMap((s) => s.lessons);
  return {
    course: { id: 'c1', slug: 'course', title: 'الكورس', bookTitle: null, bookPriceCents: null },
    sections,
    enrollmentId: 'e1',
    progressPercent: 50,
    lastLessonId: null,
    completedLessons: 1,
    totalLessons: lessons.length,
    examLessonId: null,
    ...over,
  } as CourseOutline;
}

function rowOf(title: string): HTMLElement | null {
  return screen.getByText(title).closest('li');
}

/**
 * The rail after the 2026-11 clean-up: unit cards, the current unit open,
 * and exactly ONE control per row — see `Row`'s own note for the rule.
 */
describe('CourseOutlineSidebar — rows', () => {
  it('ticks a lecture quiz that was sat and failed', () => {
    render(
      <CourseOutlineSidebar
        outline={outline([
          section('s1', 'الوحدة', [
            lesson({ id: 'lec', title: 'المحاضرة', state: 'completed', gate: 'cleared', completion: 1 }),
            lesson({ id: 'q', title: 'كويز المحاضرة', kind: 'quiz', state: 'failed', gate: 'available', completion: 0.4 }),
          ]),
        ])}
        activeLessonId="lec"
        nextLessonId={null}
      />,
    );
    expect(rowOf('كويز المحاضرة')?.classList.contains('orow--done')).toBe(true);
    // Sat once; the chip offers the result, not a second sitting.
    expect(screen.getByRole('link', { name: new RegExp(c.quizDone) })).toBeInTheDocument();
  });

  it('marks the row the student is on as current, and makes it no control at all', () => {
    render(
      <CourseOutlineSidebar
        outline={outline([
          section('s1', 'الوحدة', [
            lesson({ id: 'a', title: 'الأولى', state: 'completed', gate: 'cleared' }),
            lesson({ id: 'b', title: 'التانية', state: 'in_progress', completion: 0.3 }),
            lesson({ id: 'c', title: 'التالتة' }),
          ]),
        ])}
        activeLessonId="b"
        nextLessonId="c"
      />,
    );
    const current = rowOf('التانية')!;
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(current.querySelector('a')).toBeNull();
    expect(current.textContent).toContain(u.watching);
  });

  it('gives the NEXT lecture its quiet chip and every other open row the whole-row link', () => {
    render(
      <CourseOutlineSidebar
        outline={outline([
          section('s1', 'الوحدة', [
            lesson({ id: 'a', title: 'الأولى', state: 'completed', gate: 'cleared' }),
            lesson({ id: 'b', title: 'التانية' }),
            lesson({ id: 'c', title: 'التالتة' }),
            lesson({ id: 'd', title: 'الرابعة' }),
          ]),
        ])}
        activeLessonId="b"
        nextLessonId="c"
      />,
    );
    const next = screen.getByRole('link', { name: `${u.nextChip} — التالتة` });
    expect(next).toHaveAttribute('href', '/courses/course/lessons/c');

    // The finished row and the one two ahead: one link each, named by the row.
    expect(rowOf('الأولى')?.querySelectorAll('a')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /الرابعة/ })).toHaveAttribute('href', '/courses/course/lessons/d');
    // No «مشاهدة» wall any more.
    expect(screen.queryByText(c.watch)).toBeNull();
  });
});

describe('CourseOutlineSidebar — unit cards', () => {
  it('opens only the unit holding the active lesson, and folds a finished unit to a tick', () => {
    render(
      <CourseOutlineSidebar
        outline={outline([
          section('s1', 'الوحدة الأولى', [
            lesson({ id: 'a', title: 'أ', state: 'completed', gate: 'cleared' }),
            lesson({ id: 'b', title: 'ب', state: 'completed', gate: 'cleared' }),
          ]),
          section('s2', 'الوحدة التانية', [lesson({ id: 'c', title: 'ج' }), lesson({ id: 'd', title: 'د' })]),
          section('s3', 'الوحدة التالتة', [lesson({ id: 'e', title: 'هـ' })]),
        ])}
        activeLessonId="c"
        nextLessonId="d"
      />,
    );
    const cards = document.querySelectorAll<HTMLDetailsElement>('details.ocard');
    expect(cards).toHaveLength(3);
    expect(cards[0]!.open).toBe(false);
    expect(cards[1]!.open).toBe(true);
    expect(cards[2]!.open).toBe(false);

    expect(cards[0]!.querySelector('.ocard__done')).not.toBeNull();
    expect(cards[1]!.textContent).toContain(u.youAreHere);
    expect(cards[2]!.querySelector('.ocard__done')).toBeNull();
  });

  it('collapses a unit whose every lecture is month-locked into one «افتح الشهر»', () => {
    const month = { id: '0198c3a2-0000-7000-8000-0000000000aa', title: 'شهر ٣', lessonCount: 4 };
    render(
      <CourseOutlineSidebar
        outline={outline([
          section('s1', 'الوحدة', [lesson({ id: 'a', title: 'أ' })]),
          section('s2', 'المشروع النهائي', [
            lesson({ id: 'x', title: 'س', gate: 'locked', month }),
            lesson({ id: 'y', title: 'ص', gate: 'locked', month }),
          ]),
        ])}
        activeLessonId="a"
        nextLessonId={null}
      />,
    );
    expect(screen.getByRole('button', { name: new RegExp(u.openMonth) })).toBeInTheDocument();
    // The six padlocks it replaces are not drawn.
    expect(screen.queryByText('س')).toBeNull();
    expect(document.querySelector('.ocard--locked')?.textContent).toContain('شهر ٣');
  });

  it('renders the footer it is handed under the units', () => {
    render(
      <CourseOutlineSidebar
        outline={outline([section('s1', 'الوحدة', [lesson({ id: 'a', title: 'أ' })])])}
        activeLessonId="a"
        nextLessonId={null}
        footer={<div data-testid="foot" />}
      />,
    );
    expect(screen.getByTestId('foot')).toBeInTheDocument();
  });
});
