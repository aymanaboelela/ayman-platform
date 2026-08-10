import { describe, expect, it } from 'vitest';
import {
  MASTERY_MIN_EVIDENCE,
  MASTERY_REVIEW_BELOW,
  MASTERY_STRONG_AT,
  StudentMasterySchema,
} from './mastery';

const topic = {
  categoryId: '0198c3a2-0000-7000-8000-000000000001',
  name: 'الحلقات المتداخلة',
  answered: 6,
  accuracyPercent: 34,
  lessonId: '0198c3a2-0000-7000-8000-000000000002',
  lessonTitle: 'الحلقات',
  courseSlug: 'cs-y2',
};

describe('StudentMasterySchema', () => {
  it('accepts a topic whose lesson could not be resolved', () => {
    const parsed = StudentMasterySchema.parse({
      weakest: [{ ...topic, lessonId: null, lessonTitle: null, courseSlug: null }],
      strongest: [],
      evaluated: 1,
      pending: 0,
    });
    expect(parsed.weakest).toHaveLength(1);
    expect(parsed.weakest[0]?.lessonId).toBeNull();
  });

  it('rejects more than three weak topics — the card has room for three', () => {
    expect(() =>
      StudentMasterySchema.parse({
        weakest: [topic, topic, topic, topic],
        strongest: [],
        evaluated: 4,
        pending: 0,
      }),
    ).toThrow();
  });

  it('rejects a fractional accuracy — the server rounds', () => {
    expect(() =>
      StudentMasterySchema.parse({
        weakest: [{ ...topic, accuracyPercent: 34.5 }],
        strongest: [],
        evaluated: 1,
        pending: 0,
      }),
    ).toThrow();
  });

  it('orders the thresholds so a topic cannot be weak and strong at once', () => {
    expect(MASTERY_MIN_EVIDENCE).toBe(4);
    expect(MASTERY_REVIEW_BELOW).toBeLessThan(MASTERY_STRONG_AT);
  });
});
