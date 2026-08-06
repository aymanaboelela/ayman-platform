import { describe, expect, it } from 'vitest';
import { AdminAttemptRowSchema } from './attempts';

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
