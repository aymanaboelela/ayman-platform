import { describe, expect, it } from 'vitest';
import { isMonthlyExamLesson, MONTHLY_EXAM_LESSON } from './monthly-exam';
import { EXAM_SHELF_TITLE } from './scheduled';

describe('isMonthlyExamLesson', () => {
  it('is a quiz on the shelf — and nothing else', () => {
    expect(isMonthlyExamLesson('quiz', EXAM_SHELF_TITLE)).toBe(true);
    // A lecture put on the shelf keeps the month rule.
    expect(isMonthlyExamLesson('video', EXAM_SHELF_TITLE)).toBe(false);
    // A lecture's quiz, and the course's FINAL exam, are not monthly exams.
    expect(isMonthlyExamLesson('quiz', 'الوحدة الأولى')).toBe(false);
    expect(isMonthlyExamLesson('quiz', 'الامتحان النهائي')).toBe(false);
  });

  it('agrees with the Prisma fragment the server filters on', () => {
    expect(MONTHLY_EXAM_LESSON).toEqual({ kind: 'quiz', section: { title: EXAM_SHELF_TITLE } });
  });
});
