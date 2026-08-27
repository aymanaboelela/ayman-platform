import { describe, expect, it } from 'vitest';
import { SubmitPaymentSchema } from './payments';

const uuid = () => crypto.randomUUID();

const base = () => ({
  courseId: uuid(),
  senderPhone: '01012345678',
  screenshotKey: 'payment-proof/x.webp',
});

describe('SubmitPaymentSchema — plan/termId coherence', () => {
  it('requires termId when plan is term', () => {
    const result = SubmitPaymentSchema.safeParse({ ...base(), plan: 'term', termId: null });
    expect(result.success).toBe(false);
  });

  it('accepts plan term with a termId', () => {
    const result = SubmitPaymentSchema.safeParse({ ...base(), plan: 'term', termId: uuid() });
    expect(result.success).toBe(true);
  });

  it('forbids a termId on monthly/quarterly — a term is not part of that purchase', () => {
    const withTerm = SubmitPaymentSchema.safeParse({ ...base(), plan: 'monthly', termId: uuid() });
    expect(withTerm.success).toBe(false);
  });

  it('defaults termId to null on monthly/quarterly when omitted', () => {
    const result = SubmitPaymentSchema.safeParse({ ...base(), plan: 'monthly' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.termId).toBeNull();
  });
});
