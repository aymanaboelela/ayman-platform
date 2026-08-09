import { describe, expect, it } from 'vitest';
import { OnboardingSchema } from './onboarding';

const validEgyptianPhone = '01012345678';

function basePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fullName: 'أحمد محمد',
    gender: 'male',
    phone: validEgyptianPhone,
    governorateCode: '01',
    schoolStream: 'general',
    fatherPhone: '01098765432',
    ...overrides,
  };
}

/** Everything the base payload has, minus one key — for the required-field cases. */
function withoutKey(key: string): Record<string, unknown> {
  const payload = basePayload();
  delete payload[key];
  return payload;
}

describe('OnboardingSchema', () => {
  it.each(['schoolStream', 'fatherPhone'])('requires %s', (key) => {
    expect(OnboardingSchema.safeParse(withoutKey(key)).success).toBe(false);
  });

  it('rejects a schoolStream of «both» — a student attends one school', () => {
    expect(OnboardingSchema.safeParse(basePayload({ schoolStream: 'both' })).success).toBe(false);
  });

  /**
   * The mother's number stopped being collected, and `.strict()` is what makes
   * that a REJECTION rather than a silent strip — the same guarantee the
   * mass-assignment cases below rely on.
   */
  it('rejects a motherPhone, which is no longer part of the payload', () => {
    expect(OnboardingSchema.safeParse(basePayload({ motherPhone: '01198765432' })).success).toBe(
      false,
    );
  });

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

  /**
   * The elective is no longer a question the student answers — the wizard
   * fills it from the taxonomy along with the system and the track — so a
   * missing one means the taxonomy has no البرمجة offering to resolve, not
   * that the student skipped something. Requiring it here would put a blocking
   * error on a field that is not on screen, on a step whose only control is
   * the year select.
   */
  it('accepts بكالوريا year 2 with a track but no elective subject', () => {
    const result = OnboardingSchema.safeParse(
      basePayload({ system: 'bacalorya', year: 2, trackId: 'track-1' }),
    );
    expect(result.success).toBe(true);
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

  it("normalises the father's phone to E.164", () => {
    const result = OnboardingSchema.safeParse(basePayload({ fatherPhone: '01098765432' }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fatherPhone).toBe('+201098765432');
    }
  });

  it("rejects an invalid father's phone as loudly as the student's own", () => {
    expect(OnboardingSchema.safeParse(basePayload({ fatherPhone: '123' })).success).toBe(false);
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
