import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import { CourseOutlineView } from './course-outline';
import { LibraryCourseCard } from './library-course-card';
import type { CourseOutline } from '@/lib/course-outline';
import type { LibraryCourse } from '@/lib/library';

afterEach(cleanup);

const c = copy.library;

/**
 * «٢ / ٣» came out «٣ / ٢» on /library: a ratio of bare numbers has no strong
 * letter in it, so the RTL page laid it out right to left. Each counter now
 * holds the pair in ONE `<bdi dir="ltr">` (see `LtrRatio`) — these pin that
 * the counters really go through it, on the unit head and on the course card.
 */

function lecture(id: string, gate: 'cleared' | 'available') {
  return {
    lecture: {
      id,
      title: `محاضرة ${id}`,
      kind: 'video',
      durationSeconds: 600,
      isExam: false,
      gate,
      index: 1,
      state: null,
      month: null,
    },
    quizzes: [],
  };
}

function outline(enrolled: boolean): CourseOutline {
  return {
    enrolled,
    progressPercent: 67,
    clearedLessons: 2,
    totalLessons: 3,
    nextLessonId: 'l-3',
    sections: [
      {
        id: 's-1',
        title: 'الوحدة الأولى',
        summary: null,
        entries: [lecture('l-1', 'cleared'), lecture('l-2', 'cleared'), lecture('l-3', 'available')],
      },
    ],
  } as unknown as CourseOutline;
}

describe('the unit counter on /library/[slug]', () => {
  it('isolates «2 / 3» left to right, as one run', () => {
    const { container } = render(
      <CourseOutlineView outline={outline(true)} courseSlug="course" courseId="c-1" pendingMonths={[]} />,
    );
    const count = container.querySelector('.unit__count')!;
    const isolates = count.querySelectorAll('bdi[dir="ltr"]');
    expect(isolates).toHaveLength(1);
    expect(isolates[0]).toHaveTextContent(/^2 \/ 3$/);
  });

  it('leaves the Arabic size line alone before enrolling — it is not a ratio', () => {
    const { container } = render(
      <CourseOutlineView outline={outline(false)} courseSlug="course" courseId="c-1" pendingMonths={[]} />,
    );
    const count = container.querySelector('.unit__count')!;
    expect(count.querySelector('bdi')).toBeNull();
    expect(count).toHaveTextContent(c.lessonCount.replace('{n}', '3'));
  });
});

describe('the course card on /library', () => {
  const COURSE: LibraryCourse = {
    id: 'c-1',
    slug: 'course',
    title: 'البرمجة',
    subtitle: null,
    subjectNameAr: 'برمجة',
    coverKey: null,
    lessonCount: 3,
    totalSeconds: 1800,
    progressPercent: 67,
    clearedLessons: 2,
    contentComplete: false,
    nextLessonId: 'l-3',
  };

  it('isolates the ratio and the percentage', () => {
    const { container } = render(
      <ul>
        <LibraryCourseCard course={COURSE} />
      </ul>,
    );
    const runs = [...container.querySelectorAll('bdi[dir="ltr"]')].map((bdi) => bdi.textContent);
    expect(runs).toContain('2 / 3');
    // «خلّصنا 67%» — the percent sign stays on the number's right.
    expect(runs).toContain('67%');
  });
});
