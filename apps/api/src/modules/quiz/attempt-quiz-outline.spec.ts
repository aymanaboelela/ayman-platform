import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import { attemptQuizKind, lectureNumbers, type OutlineSectionRow } from './attempt-quiz-outline';

const lesson = (id: string, kind: string, isPublished = true) => ({ id, kind, isPublished });

describe('attemptQuizKind', () => {
  it('names the course exam by the course pointer, wherever it sits', () => {
    expect(attemptQuizKind({ id: 'exam', kind: 'quiz' }, 'الامتحان النهائي', 'exam')).toBe('course_exam');
  });

  it('names a quiz on the shelf a monthly exam — and a lecture parked there is still a lecture', () => {
    expect(attemptQuizKind({ id: 'm1', kind: 'quiz' }, EXAM_SHELF_TITLE, null)).toBe('monthly_exam');
    expect(attemptQuizKind({ id: 'v1', kind: 'video' }, EXAM_SHELF_TITLE, null)).toBe('lecture_quiz');
  });

  it('calls everything else a lecture quiz, including one attached to a video lecture', () => {
    expect(attemptQuizKind({ id: 'q1', kind: 'quiz' }, 'الوحدة الأولى', 'exam')).toBe('lecture_quiz');
    expect(attemptQuizKind({ id: 'v1', kind: 'video' }, 'الوحدة الأولى', 'exam')).toBe('lecture_quiz');
  });
});

describe('lectureNumbers', () => {
  it('counts lectures across the whole course and gives each quiz its lecture’s number', () => {
    const sections: OutlineSectionRow[] = [
      {
        title: 'الوحدة الأولى',
        isPublished: true,
        lessons: [lesson('l1', 'video'), lesson('q1', 'quiz'), lesson('l2', 'video'), lesson('q2', 'quiz')],
      },
      {
        title: 'الوحدة التانية',
        isPublished: true,
        lessons: [lesson('l3', 'text'), lesson('q3', 'quiz')],
      },
    ];
    const numbers = lectureNumbers(sections, null);
    // The counter never restarts per unit, and a quiz never moves it — a
    // three-lecture course numbers up to three, not to six.
    expect(Object.fromEntries(numbers)).toEqual({ l1: 1, q1: 1, l2: 2, q2: 2, l3: 3, q3: 3 });
  });

  it('counts only what a student can see', () => {
    const sections: OutlineSectionRow[] = [
      {
        title: 'الوحدة الأولى',
        isPublished: true,
        lessons: [lesson('l1', 'video'), lesson('draft', 'video', false), lesson('qDraft', 'quiz'), lesson('l2', 'video')],
      },
      // A whole unpublished unit takes no numbers…
      { title: 'لسه بتتكتب', isPublished: false, lessons: [lesson('hidden', 'video'), lesson('qHidden', 'quiz')] },
      // …and neither does the monthly-exam shelf, which no outline shows.
      { title: EXAM_SHELF_TITLE, isPublished: true, lessons: [lesson('month1', 'quiz')] },
      { title: 'الوحدة التالتة', isPublished: true, lessons: [lesson('l3', 'video')] },
    ];
    const numbers = lectureNumbers(sections, null);
    expect(numbers.get('l1')).toBe(1);
    expect(numbers.get('l2')).toBe(2);
    expect(numbers.get('l3')).toBe(3);
    // The quiz under an unpublished lecture maps to THAT lecture, which has
    // no number — not to the published lecture before it.
    expect(numbers.has('qDraft')).toBe(false);
    expect(numbers.has('qHidden')).toBe(false);
    expect(numbers.has('month1')).toBe(false);
  });

  it('lets an ownerless quiz stand on its own, without reaching into the previous unit', () => {
    const sections: OutlineSectionRow[] = [
      { title: 'أ', isPublished: true, lessons: [lesson('l1', 'video')] },
      { title: 'ب', isPublished: true, lessons: [lesson('orphan', 'quiz'), lesson('qAfter', 'quiz'), lesson('l2', 'video')] },
    ];
    expect(Object.fromEntries(lectureNumbers(sections, null))).toEqual({ l1: 1, orphan: 2, qAfter: 2, l2: 3 });
  });

  it('keeps the course exam a row of its own, as the student outline does', () => {
    const sections: OutlineSectionRow[] = [
      { title: 'الوحدة الأولى', isPublished: true, lessons: [lesson('l1', 'video'), lesson('q1', 'quiz')] },
      { title: 'الامتحان النهائي', isPublished: true, lessons: [lesson('exam', 'quiz')] },
    ];
    const numbers = lectureNumbers(sections, 'exam');
    expect(numbers.get('q1')).toBe(1);
    // Never nested under lecture 1: it belongs to the course.
    expect(numbers.get('exam')).toBe(2);
  });
});
