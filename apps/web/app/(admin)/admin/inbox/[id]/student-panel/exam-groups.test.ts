import { describe, expect, it } from 'vitest';
import type { AdminAttemptRow } from '@ayman/contracts/admin/attempts';
import { groupAttemptsByExam, summarizeExams } from './exam-groups';

function row(over: Partial<AdminAttemptRow>): AdminAttemptRow {
  return {
    id: 'a',
    userId: 'u',
    studentName: 'طالب',
    quizId: 'q1',
    quizTitle: 'امتحان',
    attemptNumber: 1,
    state: 'submitted',
    score: 10,
    startedAt: '2026-11-01T10:00:00.000Z',
    submittedAt: '2026-11-01T10:30:00.000Z',
    deadlineAt: null,
    paper: 'original',
    gradeOutOf: 20,
    percent: 50,
    passed: true,
    courseId: 'c',
    courseTitle: 'كورس',
    sectionTitle: 'باب',
    lessonId: 'l',
    lessonTitle: 'امتحان الشهر',
    kind: 'monthly_exam',
    ...over,
  };
}

describe('groupAttemptsByExam', () => {
  it('folds sittings of one exam into one group, newest first', () => {
    const groups = groupAttemptsByExam([
      row({ id: 'old', attemptNumber: 1, startedAt: '2026-11-01T10:00:00.000Z' }),
      row({ id: 'other', quizId: 'q2', startedAt: '2026-11-02T10:00:00.000Z' }),
      row({ id: 'new', attemptNumber: 2, startedAt: '2026-11-03T10:00:00.000Z' }),
    ]);
    expect(groups.map((g) => g.quizId)).toEqual(['q1', 'q2']);
    expect(groups[0]!.latest.id).toBe('new');
    expect(groups[0]!.attempts.map((a) => a.id)).toEqual(['new', 'old']);
  });

  it('breaks a same-instant tie on the attempt number', () => {
    const at = '2026-11-01T10:00:00.000Z';
    const [group] = groupAttemptsByExam([
      row({ id: 'first', attemptNumber: 1, startedAt: at }),
      row({ id: 'second', attemptNumber: 2, startedAt: at }),
    ]);
    expect(group!.latest.id).toBe('second');
  });
});

describe('summarizeExams', () => {
  it('averages the latest marked sitting per exam, not every sitting', () => {
    const summary = summarizeExams(
      groupAttemptsByExam([
        row({ id: 'q1-old', percent: 20, passed: false, startedAt: '2026-11-01T10:00:00.000Z' }),
        row({ id: 'q1-new', attemptNumber: 2, percent: 80, passed: true, startedAt: '2026-11-02T10:00:00.000Z' }),
        row({ id: 'q2', quizId: 'q2', percent: 40, passed: false }),
      ]),
    );
    expect(summary).toEqual({ sat: 2, average: 60, passed: 1, pending: 0 });
  });

  it('leaves an unmarked paper out of the average and counts it as pending', () => {
    const summary = summarizeExams(
      groupAttemptsByExam([row({ state: 'pending_review', percent: null, passed: null })]),
    );
    expect(summary).toEqual({ sat: 1, average: null, passed: 0, pending: 1 });
  });
});
