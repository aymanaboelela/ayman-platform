import { describe, expect, it } from 'vitest';
import { QUESTION_TYPES } from '@ayman/contracts/quiz/question';
import { HydratedQuizSchema } from './page';
import { DEFAULT_REVIEW_OPTIONS } from '@ayman/contracts/quiz/quiz-settings';

function quizWithSlotType(type: string): unknown {
  return {
    id: 'quiz-1',
    lessonId: 'lesson-1',
    isCourseExam: false,
    isPublished: true,
    sumMarks: 1,
    improvementSumMarks: 0,
    settings: {
      durationSeconds: null,
      openFrom: null,
      openUntil: null,
      allowsImprovement: false,
      passPercent: 70,
      shuffleQuestions: false,
      shuffleOptions: true,
      overdueHandling: 'autosubmit',
      graceSeconds: 60,
      navMethod: 'free',
      gradeOutOf: 100,
      reviewOptions: DEFAULT_REVIEW_OPTIONS,
    },
    slots: [
      {
        id: 'slot-1',
        paper: 'original',
        position: 0,
        maxMark: 1,
        kind: 'question',
        bankEntryId: 'entry-1',
        type,
        stemHtml: '<p>س</p>',
        poolName: null,
        poolPickCount: null,
      },
    ],
  };
}

describe('QuizBuilderPage payload schema', () => {
  // The regression this exists for: `type` was a hand-written
  // `z.enum(['mcq_single', ...])` that predated `ordering`. TypeScript is
  // perfectly happy with a list of string literals that is missing one, so the
  // first exam anyone put an ordering question in would have thrown on this
  // parse — the builder page for that quiz, and only that quiz, refusing to
  // render for the instructor who was mid-way through building it.
  it.each(QUESTION_TYPES)('accepts a %s slot', (type) => {
    const result = HydratedQuizSchema.safeParse(quizWithSlotType(type));
    expect(result.success).toBe(true);
  });

  it('still rejects a type the contract does not define', () => {
    const result = HydratedQuizSchema.safeParse(quizWithSlotType('drag_and_drop'));
    expect(result.success).toBe(false);
  });

  it('accepts a pool slot, whose type is null', () => {
    const payload = quizWithSlotType('mcq_single') as {
      slots: { type: string | null; kind: string; bankEntryId: string | null }[];
    };
    payload.slots[0]!.kind = 'pool';
    payload.slots[0]!.type = null;
    payload.slots[0]!.bankEntryId = null;
    expect(HydratedQuizSchema.safeParse(payload).success).toBe(true);
  });
});
