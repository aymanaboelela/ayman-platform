import { describe, expect, it } from 'vitest';
import { AdminManualSubscribeSchema } from './payments';

const uuid = () => crypto.randomUUID();

describe('AdminManualSubscribeSchema — plan/termId coherence', () => {
  it('requires termId when plan is term', () => {
    const result = AdminManualSubscribeSchema.safeParse({
      courseId: uuid(),
      plan: 'term',
      isFree: true,
      screenshotKey: null,
    });
    expect(result.success).toBe(false);
  });

  it('accepts plan term with a termId', () => {
    const result = AdminManualSubscribeSchema.safeParse({
      courseId: uuid(),
      plan: 'term',
      termId: uuid(),
      isFree: true,
      screenshotKey: null,
    });
    expect(result.success).toBe(true);
  });

  it('forbids a termId on monthly/quarterly', () => {
    const result = AdminManualSubscribeSchema.safeParse({
      courseId: uuid(),
      plan: 'monthly',
      termId: uuid(),
      isFree: false,
      screenshotKey: null,
    });
    expect(result.success).toBe(false);
  });
});
