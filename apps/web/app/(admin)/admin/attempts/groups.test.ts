import { describe, expect, it } from 'vitest';
import type { AdminAttemptQuizSummary } from '@ayman/contracts/admin/attempts';
import { groupAttemptQuizzes } from './groups';

let seq = 0;
function line(courseId: string, sectionId: string, numbers: Partial<AdminAttemptQuizSummary> = {}): AdminAttemptQuizSummary {
  seq += 1;
  return {
    quizId: `quiz-${seq}`,
    lessonId: `lesson-${seq}`,
    lessonTitle: `كويز الدرس ${seq}`,
    kind: 'lecture_quiz',
    lectureNumber: seq,
    published: true,
    courseId,
    courseTitle: courseId === 'a' ? 'تانية بكالوريا' : 'أولى بكالوريا',
    courseArchived: false,
    sectionId,
    // Two units, one name — the fold must still keep them apart.
    sectionTitle: 'مراجعة',
    gradeOutOf: 20,
    passPercent: 50,
    allowsImprovement: false,
    attempts: 0,
    students: 0,
    inProgress: 0,
    overdue: 0,
    submitted: 0,
    pendingReview: 0,
    abandoned: 0,
    averagePercent: null,
    passRatePercent: null,
    lastActivityAt: null,
    ...numbers,
  };
}

describe('groupAttemptQuizzes', () => {
  it('folds the API’s ordered lines into course → unit → quiz, without re-sorting', () => {
    const lines = [
      line('a', 's1', { attempts: 4, pendingReview: 1 }),
      line('a', 's1', { attempts: 2, inProgress: 2 }),
      line('a', 's2', { attempts: 1 }),
      line('b', 's3'),
    ];
    const groups = groupAttemptQuizzes(lines);

    expect(groups.map((group) => group.courseTitle)).toEqual(['تانية بكالوريا', 'أولى بكالوريا']);
    expect(groups[0]).toMatchObject({ attempts: 7, pendingReview: 1, inProgress: 2 });
    expect(groups[0]!.sections.map((section) => [section.sectionId, section.quizzes.length])).toEqual([
      ['s1', 2],
      ['s2', 1],
    ]);
    expect(groups[0]!.sections[0]!.quizzes.map((quiz) => quiz.quizId)).toEqual([lines[0]!.quizId, lines[1]!.quizId]);
    expect(groups[1]).toMatchObject({ attempts: 0, sections: [{ sectionId: 's3' }] });
  });

  it('is empty for nothing sat', () => {
    expect(groupAttemptQuizzes([])).toEqual([]);
  });
});
