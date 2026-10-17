import { describe, expect, it } from 'vitest';
import {
  AdminAttemptListQuerySchema,
  AdminAttemptRowSchema,
  AdminAttemptsOverviewQuerySchema,
} from './attempts';

const QUIZ = '0190cccc-0000-7000-8000-000000000001';

function row(state: string) {
  return {
    id: 'a1',
    userId: 'u1',
    studentName: 'طالب',
    quizId: 'q1',
    quizTitle: 'امتحان',
    attemptNumber: 1,
    state,
    score: null,
    startedAt: new Date().toISOString(),
    submittedAt: null,
    deadlineAt: null,
    paper: 'original',
    gradeOutOf: 20,
    percent: null,
    passed: null,
    courseId: 'c1',
    courseTitle: 'كورس',
    sectionTitle: 'الوحدة الأولى',
    lessonId: 'l1',
    lessonTitle: 'امتحان',
    kind: 'lecture_quiz',
  };
}

describe('AdminAttemptRowSchema', () => {
  it('accepts every real AttemptState value', () => {
    for (const state of ['in_progress', 'overdue', 'submitted', 'pending_review', 'abandoned']) {
      expect(AdminAttemptRowSchema.safeParse(row(state)).success).toBe(true);
    }
  });

  it('does not cap the percent — an overridden score above the scale must not 500 the page', () => {
    expect(AdminAttemptRowSchema.safeParse({ ...row('submitted'), score: 22, percent: 110 }).success).toBe(true);
  });
});

describe('AdminAttemptListQuerySchema', () => {
  it('defaults to the newest twenty, first page', () => {
    expect(AdminAttemptListQuerySchema.parse({})).toEqual({ sort: 'newest', page: 1, perPage: 20 });
  });

  it('reads a blank box as no filter — a GET form sends `q=` and `courseId=`', () => {
    const parsed = AdminAttemptListQuerySchema.parse({ q: '  ', courseId: '', state: '', sort: '', page: '' });
    expect(parsed.q).toBeUndefined();
    expect(parsed.courseId).toBeUndefined();
    expect(parsed.state).toBeUndefined();
    expect(parsed.sort).toBe('newest');
    expect(parsed.page).toBe(1);
  });

  it('coerces the query-string numbers and trims the search', () => {
    const parsed = AdminAttemptListQuerySchema.parse({ quizId: QUIZ, page: '3', perPage: '50', q: ' أحمد ' });
    expect(parsed).toMatchObject({ quizId: QUIZ, page: 3, perPage: 50, q: 'أحمد' });
  });

  it('refuses what would otherwise reach Postgres or an ORDER BY unchecked', () => {
    expect(AdminAttemptListQuerySchema.safeParse({ courseId: 'nope' }).success).toBe(false);
    expect(AdminAttemptListQuerySchema.safeParse({ sort: 'id; drop table' }).success).toBe(false);
    expect(AdminAttemptListQuerySchema.safeParse({ state: 'graded' }).success).toBe(false);
    // `ListQuerySchema`'s closed list — 25 is the classic wrong guess.
    expect(AdminAttemptListQuerySchema.safeParse({ perPage: '25' }).success).toBe(false);
    expect(AdminAttemptListQuerySchema.safeParse({ q: 'x'.repeat(121) }).success).toBe(false);
  });

  it('takes a better-auth nanoid as a student id — never a uuid check', () => {
    expect(AdminAttemptListQuerySchema.parse({ userId: 'Xk2f9Qm1ZtR4bW7pLs0aVc8dEy3uNh6J' }).userId).toBe(
      'Xk2f9Qm1ZtR4bW7pLs0aVc8dEy3uNh6J',
    );
  });

  it('lets an unrelated parameter ride along on a read', () => {
    expect(AdminAttemptListQuerySchema.safeParse({ oq: 'الدرس', take: '21' }).success).toBe(true);
  });
});

describe('AdminAttemptsOverviewQuerySchema', () => {
  it('is all optional, and blank is absent', () => {
    expect(AdminAttemptsOverviewQuerySchema.parse({})).toEqual({});
    expect(AdminAttemptsOverviewQuerySchema.parse({ courseId: '', q: '' })).toEqual({});
    expect(AdminAttemptsOverviewQuerySchema.safeParse({ lessonId: 'x' }).success).toBe(false);
  });
});
