import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import { CourseOutlineView } from './course-outline';
import type { CourseOutline } from '@/lib/course-outline';

afterEach(cleanup);

const c = copy.library;

/** The smallest outline the view will render: one unit, one open lecture. */
const OUTLINE: CourseOutline = {
  enrolled: true,
  progressPercent: 0,
  clearedLessons: 0,
  totalLessons: 1,
  nextLessonId: 'l-1',
  sections: [
    {
      id: 's-1',
      title: 'الوحدة الأولى',
      summary: null,
      entries: [
        {
          lecture: {
            id: 'l-1',
            title: 'محاضرة ١',
            kind: 'video',
            durationSeconds: 600,
            isExam: false,
            gate: 'available',
            index: 1,
            state: null,
            month: null,
          },
          quizzes: [],
        },
      ],
    },
  ],
} as unknown as CourseOutline;

function view(pendingMonths: string[]) {
  render(
    <CourseOutlineView
      outline={OUTLINE}
      courseSlug="course"
      courseId="c-1"
      pendingMonths={pendingMonths}
    />,
  );
}

/**
 * «محاضرات شهر ٢ بتتجهّز».
 *
 * The outline groups by UNIT, not by month, so a month with nothing in it has
 * no row to draw. Before this line, a student who paid for «شهر ٢» opened this
 * page and saw month-1 lectures behind padlocks and nothing else — no mention
 * at all of the thing he had just paid for. That page does not read as «not
 * ready yet», it reads as «the money is gone».
 */
describe('the pending-month line', () => {
  it('names the month a student paid for and has nothing in yet', () => {
    view(['شهر ٢']);
    expect(screen.getByText(c.ownedMonthsPending.replace('{months}', 'شهر ٢'))).toBeTruthy();
  });

  it('joins several into one sentence rather than stacking lines', () => {
    view(['شهر ٢', 'شهر ٣']);
    expect(
            // «وشهر»، مش «و شهر» — الواو بتتلزق بالكلمة اللي بعدها في العربي.
      screen.getByText(c.ownedMonthsPending.replace('{months}', 'شهر ٢ وشهر ٣')),
    ).toBeTruthy();
  });

  /*
   * The ordinary case, and the one worth a test of its own: every other
   * student on the platform — the term subscriber, the yearly one, the month
   * buyer whose month has lectures — must not be told anything is pending.
   * A reassurance shown to someone who needs no reassurance is just noise on
   * the page they open most.
   */
  it('says nothing at all when no owned month is empty', () => {
    view([]);
    expect(screen.queryByText(/بتتجهّز/)).toBeNull();
  });

  /*
   * رسمة، مش سطر رمادي — ومكتوب ليه في `spot-illustration.tsx` نفسه:
   * «مستطيل رمادي مش بيتفرق عن حاجة بايظة». والحتة دي بالذات هي اللي الطالب
   * بيدوّر فيها على فلوسه، فلو الجواب باهت هو مش هيقراه على إنه جواب.
   */
  it('draws it as a real empty state, not a grey line', () => {
    const { container } = render(
      <CourseOutlineView
        outline={OUTLINE}
        courseSlug="course"
        courseId="c-1"
        pendingMonths={['شهر ٢']}
      />,
    );

    expect(screen.getByText(c.ownedMonthsPendingTitle)).toBeTruthy();
    expect(container.querySelector('.empty')).toBeTruthy();
    // `aria-hidden` — الجملة تحتها بتقول نفس الحاجة بالكلام، فالقارئ الصوتي
    // مايعيدهاش. نفس قاعدة باقي الرسومات.
    const spot = container.querySelector('svg.spot');
    expect(spot).toBeTruthy();
    expect(spot?.getAttribute('aria-hidden')).toBe('true');
  });
});
