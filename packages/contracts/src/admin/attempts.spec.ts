import { describe, expect, it } from 'vitest';
import { AdminAppealRowSchema, AdminAttemptRowSchema } from './attempts';

describe('AdminAttemptRowSchema', () => {
  it('accepts every real AttemptState value', () => {
    for (const state of ['in_progress', 'overdue', 'submitted', 'pending_review', 'abandoned']) {
      expect(
        AdminAttemptRowSchema.safeParse({
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
        }).success,
      ).toBe(true);
    }
  });
});

describe('AdminAppealRowSchema', () => {
  it('accepts every real AppealStatus value, including under_review', () => {
    for (const state of ['open', 'under_review', 'accepted', 'rejected']) {
      expect(
        AdminAppealRowSchema.safeParse({
          id: 'ap1',
          attemptId: 'a1',
          attemptQuestionId: 'aq1',
          questionVersionId: 'qv1',
          userId: 'u1',
          studentName: 'طالب',
          quizId: 'q1',
          quizTitle: 'امتحان',
          reasonAr: 'سبب',
          state,
          resolutionAr: null,
          resolvedBy: null,
          resolvedAt: null,
          createdAt: new Date().toISOString(),
        }).success,
      ).toBe(true);
    }
  });
});
