import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import type { StudentExam } from '@ayman/contracts/quiz/scheduled';
import { LessonExamStrip, lessonExams } from './lesson-exam-strip';

afterEach(cleanup);

const s = copy.player.examStrip;
const c = copy.player.courseExams;
const COURSE = '0198c3a2-0000-7000-8000-000000000001';
const OTHER = '0198c3a2-0000-7000-8000-000000000002';

function exam(over: Partial<StudentExam> = {}): StudentExam {
  return {
    lessonId: '0198c3a2-0000-7000-8000-0000000000e1',
    courseId: COURSE,
    courseTitle: 'الكورس',
    courseSlug: 'course',
    title: 'امتحان شهر نوفمبر',
    phase: 'open',
    openFrom: '2026-11-10T08:00:00.000Z',
    openUntil: '2026-11-20T20:00:00.000Z',
    keptOpen: false,
    durationSeconds: 2400,
    gradeOutOf: 20,
    coveredLessons: [],
    scaledScore: null,
    hasSat: false,
    ...over,
  };
}

describe('lessonExams', () => {
  it("prefers this course's own door over the dashboard's exam", () => {
    const mine = exam({ lessonId: '0198c3a2-0000-7000-8000-0000000000e2', phase: 'closed', keptOpen: true });
    const band = exam({ courseId: OTHER });
    expect(lessonExams([band, mine], COURSE)).toEqual([mine]);
  });

  it("falls back to the dashboard's exam, but never to one already sat", () => {
    const band = exam({ courseId: OTHER });
    expect(lessonExams([band], COURSE)).toEqual([band]);
    expect(lessonExams([{ ...band, hasSat: true }], COURSE)).toEqual([]);
  });

  it('is empty on a stack without exams', () => {
    expect(lessonExams([], COURSE)).toEqual([]);
  });
});

describe('LessonExamStrip', () => {
  it('draws one strip with the deadline, the length and the one button', () => {
    render(<LessonExamStrip exams={[exam()]} slot="rail" />);
    const go = screen.getByRole('link', { name: new RegExp(c.start) });
    expect(go).toHaveTextContent(s.go);
    expect(go.getAttribute('href')).toContain('0198c3a2-0000-7000-8000-0000000000e1');
    expect(screen.getByText(/40 دقيقة/)).toBeInTheDocument();
  });

  it('offers no button on an exam that has not opened yet', () => {
    render(<LessonExamStrip exams={[exam({ phase: 'upcoming' })]} slot="door" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders nothing with no exam', () => {
    const { container } = render(<LessonExamStrip exams={[]} slot="rail" />);
    expect(container).toBeEmptyDOMElement();
  });
});
