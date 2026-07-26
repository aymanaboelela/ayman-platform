import { describe, expect, it } from 'vitest';
import { OnboardingSchema } from './onboarding';

const validEgyptianPhone = '01012345678';

function basePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fullName: 'أحمد محمد',
    gender: 'male',
    phone: validEgyptianPhone,
    governorateCode: '01',
    ...overrides,
  };
}

describe('OnboardingSchema', () => {
  it('accepts a valid grade-1 payload with no track', () => {
    const result = OnboardingSchema.safeParse(basePayload({ system: 'bacalorya', year: 1 }));
    expect(result.success).toBe(true);
  });

  it('accepts a minimal payload with no system/year/track at all (grade-1 pre-split)', () => {
    const result = OnboardingSchema.safeParse(basePayload());
    expect(result.success).toBe(true);
  });

  it('rejects a grade-1 payload that carries a track', () => {
    const result = OnboardingSchema.safeParse(
      basePayload({ system: 'bacalorya', year: 1, trackId: 'some-track-id' }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('trackId'))).toBe(true);
    }
  });

  it('rejects بكالوريا year 2 without an elective subject', () => {
    const result = OnboardingSchema.safeParse(
      basePayload({ system: 'bacalorya', year: 2, trackId: 'track-1' }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('electiveSubjectId'))).toBe(true);
    }
  });

  it('accepts بكالوريا year 2 with track + elective', () => {
    const result = OnboardingSchema.safeParse(
      basePayload({
        system: 'bacalorya',
        year: 2,
        trackId: 'track-1',
        electiveSubjectId: 'offering-1',
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects an elective subject when the system is ثانوية عامة', () => {
    const result = OnboardingSchema.safeParse(
      basePayload({
        system: 'thanaweya_amma',
        year: 2,
        trackId: 'track-1',
        electiveSubjectId: 'offering-1',
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('electiveSubjectId'))).toBe(true);
    }
  });

  it('rejects a track without a system', () => {
    const result = OnboardingSchema.safeParse(basePayload({ year: 2, trackId: 'track-1' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('system'))).toBe(true);
    }
  });

  it('normalises a valid Egyptian phone to E.164', () => {
    const result = OnboardingSchema.safeParse(basePayload({ phone: '01012345678' }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe('+201012345678');
    }
  });

  it('normalises father/mother phones to E.164 when present', () => {
    const result = OnboardingSchema.safeParse(
      basePayload({ fatherPhone: '01098765432', motherPhone: '01198765432' }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fatherPhone).toBe('+201098765432');
      expect(result.data.motherPhone).toBe('+201198765432');
    }
  });

  it('rejects an invalid Egyptian phone', () => {
    const result = OnboardingSchema.safeParse(basePayload({ phone: '123' }));
    expect(result.success).toBe(false);
  });

  it('rejects a non-Egyptian phone number', () => {
    const result = OnboardingSchema.safeParse(basePayload({ phone: '+14155552671' }));
    expect(result.success).toBe(false);
  });

  it('rejects a payload carrying role: admin — mass assignment must fail loudly, not strip silently', () => {
    const result = OnboardingSchema.safeParse(basePayload({ role: 'admin' }));
    expect(result.success).toBe(false);
  });

  it('rejects a payload carrying an explicit userId', () => {
    const result = OnboardingSchema.safeParse(basePayload({ userId: 'someone-else' }));
    expect(result.success).toBe(false);
  });

  it('rejects a payload carrying onboardingCompletedAt', () => {
    const result = OnboardingSchema.safeParse(
      basePayload({ onboardingCompletedAt: new Date().toISOString() }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a missing full name', () => {
    const result = OnboardingSchema.safeParse(basePayload({ fullName: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects an invalid gender', () => {
    const result = OnboardingSchema.safeParse(basePayload({ gender: 'other' }));
    expect(result.success).toBe(false);
  });
});
